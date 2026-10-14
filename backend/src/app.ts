import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { z } from "zod";
import { authenticationHook } from "./auth/guards.js";
import type { Container } from "./container.js";
import { AppError } from "./domain/errors.js";
import { registerRoutes } from "./http/routes.js";

function isHttpError(error: unknown): error is Error & { statusCode: number; code?: string } {
  return error instanceof Error &&
    "statusCode" in error && typeof (error as { statusCode?: unknown }).statusCode === "number";
}

function validRequestId(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : randomUUID();
}

function tokenMatches(received: string, expected: string): boolean {
  const left = createHash("sha256").update(received).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

const ADMISSION_REJECTION_CODES = new Set([
  "queue_saturated",
  "organization_queue_limit",
  "organization_daily_model_budget",
  "organization_daily_spend_budget",
]);

export async function buildApp(container: Container) {
  const app = Fastify({
    logger: {
      level: container.config.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "password",
          "token",
          "secret",
          "prompt",
          "content",
          "payload",
        ],
        censor: "[REDACTED]",
      },
    },
    genReqId: (request) => validRequestId(request.headers["x-request-id"]),
    bodyLimit: container.config.HTTP_BODY_LIMIT_BYTES,
    requestTimeout: container.config.HTTP_REQUEST_TIMEOUT_MS,
    exposeHeadRoutes: false,
    trustProxy: container.config.TRUST_PROXY_HOPS === 0
      ? false
      : (_address: string, hop: number) => hop < container.config.TRUST_PROXY_HOPS,
  });

  app.decorateRequest("principal", null);
  const admitted = new WeakSet<object>();
  const startedAt = new WeakMap<object, number>();
  let inFlight = 0;
  await app.register(cors, {
    origin: container.config.CORS_ORIGIN
      ? container.config.CORS_ORIGIN.split(",").map((origin) => origin.trim())
      : false,
    methods: ["GET", "POST", "PUT", "PATCH"],
    allowedHeaders: ["authorization", "content-type"],
  });

  await app.register(rateLimit, {
    global: true,
    hook: "onRequest",
    max: container.config.RATE_LIMIT_MAX,
    timeWindow: container.config.RATE_LIMIT_WINDOW_MS,
    keyGenerator: (request) => request.ip,
  });
  app.addHook("onRequest", async (request, reply) => {
    if (inFlight >= container.config.HTTP_MAX_CONCURRENT_REQUESTS) {
      container.metrics.recordRequest(request.method, "overload", 503, 0);
      await reply
        .code(503)
        .header("retry-after", "1")
        .send({ error: { code: "server_busy", message: "The API is at capacity; retry shortly" } });
      return;
    }
    inFlight += 1;
    admitted.add(request);
    startedAt.set(request, performance.now());
  });
  const authenticate = authenticationHook(container.apiKeys, container.userIdentities);
  app.addHook("onRequest", async (request, reply) => {
    await container.performance.measure({
      stage: "authentication",
      correlationId: request.id,
    }, () => authenticate(request));
  });
  app.addHook("onSend", async (request, reply, payload) => {
    reply
      .header("x-request-id", request.id)
      .header("cache-control", "no-store")
      .header("content-security-policy", "default-src 'none'; frame-ancestors 'none'")
      .header("permissions-policy", "camera=(), microphone=(), geolocation=()")
      .header("referrer-policy", "no-referrer")
      .header("x-content-type-options", "nosniff")
      .header("x-frame-options", "DENY");
    if (container.config.NODE_ENV === "production") {
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    return payload;
  });
  const recordCompletion = (request: object, method: string, route: string, statusCode: number) => {
    if (!admitted.delete(request)) return null;
    inFlight = Math.max(0, inFlight - 1);
    const start = startedAt.get(request) ?? performance.now();
    startedAt.delete(request);
    const durationMs = performance.now() - start;
    container.metrics.recordRequest(method, route, statusCode, durationMs);
    return durationMs;
  };
  app.addHook("onResponse", async (request, reply) => {
    const durationMs = recordCompletion(
      request,
      request.method,
      request.routeOptions.url ?? "unmatched",
      reply.statusCode,
    );
    if (durationMs !== null) {
      container.performance.record({
        stage: "http_request",
        correlationId: request.id,
        durationMs,
        outcome: reply.statusCode >= 500 ? "error" : "ok",
      });
    }
  });
  app.addHook("onError", async (request, reply) => {
    const durationMs = recordCompletion(
      request,
      request.method,
      request.routeOptions.url ?? "unmatched",
      reply.statusCode >= 400 ? reply.statusCode : 500,
    );
    if (durationMs !== null) {
      container.performance.record({
        stage: "http_request",
        correlationId: request.id,
        durationMs,
        outcome: "error",
      });
    }
  });

  app.get("/metrics", async (request, reply) => {
    const expected = container.config.METRICS_BEARER_TOKEN;
    const received = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!expected || !received || !tokenMatches(received, expected)) {
      return reply.code(404).send({ error: { code: "not_found", message: "Not found" } });
    }
    return reply
      .header("content-type", "text/plain; version=0.0.4; charset=utf-8")
      .send(await container.metrics.render());
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof z.ZodError) {
      await reply.code(400).send({
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
      });
      return;
    }
    if (error instanceof AppError) {
      if (ADMISSION_REJECTION_CODES.has(error.code)) {
        container.metrics.recordAdmissionRejection(error.code);
      }
      await reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      });
      return;
    }
    if (isHttpError(error) && error.statusCode >= 400 && error.statusCode < 500) {
      await reply.code(error.statusCode).send({
        error: {
          code: error.statusCode === 429 ? "rate_limit_exceeded" : (error.code ?? "bad_request"),
          message: error.statusCode === 429
            ? "Too many requests; retry later"
            : "The request could not be processed",
        },
      });
      return;
    }
    const databaseCode = (error as { code?: string }).code;
    if (databaseCode === "23505") {
      await reply.code(409).send({
        error: { code: "resource_conflict", message: "A resource with these values already exists" },
      });
      return;
    }
    if (databaseCode === "23503" || databaseCode === "23514") {
      await reply.code(400).send({
        error: { code: "invalid_reference", message: "The request contains an invalid value" },
      });
      return;
    }

    request.log.error({ err: error }, "Unhandled request error");
    await reply.code(500).send({
      error: { code: "internal_error", message: "An unexpected error occurred" },
    });
  });

  await registerRoutes(app, container);
  app.addHook("onClose", async () => container.pool.end());
  return app;
}
