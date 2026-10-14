import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { getRequestAuth } from "@/lib/server/request-auth";
import { getServerConfig } from "@/lib/server/config";
import { acceptsJson, isSameOrigin, json } from "@/lib/server/http";
import { isAllowedSmmRoute } from "@/lib/server/smm-route-policy";

const MAX_BODY_BYTES = 512 * 1024;
// A run can currently contain model artifact drafts in `output` and the same
// content again in persisted artifact rows. Four MiB safely covers the
// backend's present schema maxima while still bounding a compromised upstream.
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 20_000;
async function readBoundedStream(
  stream: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<{ text: string; exceeded: boolean }> {
  if (!stream) return { text: "", exceeded: false };

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      return { text: "", exceeded: true };
    }
    parts.push(decoder.decode(value, { stream: true }));
  }

  parts.push(decoder.decode());
  return { text: parts.join(""), exceeded: false };
}

async function proxy(context: Parameters<APIRoute>[0]): Promise<Response> {
  const path = context.params.path ?? "";
  const method = context.request.method.toUpperCase();

  if (!isAllowedSmmRoute(method, path)) {
    return json(
      {
        error: {
          code: "ROUTE_NOT_ALLOWED",
          message: "This backend operation is not exposed.",
        },
      },
      404,
    );
  }

  if (
    method !== "GET" &&
    (!isSameOrigin(context, getServerConfig().AUTH_TRUSTED_ORIGINS) ||
      !acceptsJson(context.request))
  ) {
    return json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Mutations require same-origin JSON requests.",
        },
      },
      400,
    );
  }

  const contentLength = Number(
    context.request.headers.get("content-length") ?? 0,
  );
  if (contentLength > MAX_BODY_BYTES) {
    return json(
      {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request body exceeds 512 KiB.",
        },
      },
      413,
    );
  }

  let requestBody: { text: string; exceeded: boolean };
  try {
    requestBody =
      method === "GET"
        ? { text: "", exceeded: false }
        : await readBoundedStream(context.request.body, MAX_BODY_BYTES);
  } catch {
    return json(
      {
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "The request body could not be read.",
        },
      },
      400,
    );
  }
  if (requestBody.exceeded) {
    return json(
      {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request body exceeds 512 KiB.",
        },
      },
      413,
    );
  }
  const body = method === "GET" ? undefined : requestBody.text;

  try {
    const config = getServerConfig();
    const incomingRequestId = context.request.headers.get("x-request-id");
    const requestId = incomingRequestId && /^[A-Za-z0-9._:-]{1,128}$/.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID();
    const auth = await getRequestAuth(context);
    const { token } = await auth.api.getToken({
      headers: context.request.headers,
    });
    const requestInit: RequestInit = {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": requestId,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    };
    if (body !== undefined) requestInit.body = body;
    const upstream = await fetch(
      new URL(`/${path}${context.url.search}`, config.SMM_API_BASE_URL),
      requestInit,
    );

    const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      return json(
        {
          error: {
            code: "UPSTREAM_RESPONSE_TOO_LARGE",
            message: "The orchestration response exceeded 4 MiB.",
          },
        },
        502,
      );
    }
    const responseBody = await readBoundedStream(
      upstream.body,
      MAX_RESPONSE_BYTES,
    );
    if (responseBody.exceeded) {
      return json(
        {
          error: {
            code: "UPSTREAM_RESPONSE_TOO_LARGE",
            message: "The orchestration response exceeded 4 MiB.",
          },
        },
        502,
      );
    }
    const contentType =
      upstream.headers.get("content-type")?.toLowerCase() ?? "";
    if (responseBody.text && !contentType.includes("application/json")) {
      return json(
        {
          error: {
            code: "INVALID_UPSTREAM_RESPONSE",
            message: "The orchestration service returned a non-JSON response.",
          },
        },
        502,
      );
    }
    return new Response(responseBody.text || null, {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-request-id": upstream.headers.get("x-request-id") ?? requestId,
      },
    });
  } catch (error) {
    console.error("SMM PROXY ERROR:", error);
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return json(
      {
        error: {
          code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
          message: timedOut
            ? "The orchestration service took too long to respond."
            : "The orchestration service is currently unavailable.",
        },
      },
      timedOut ? 504 : 503,
    );
  }
}

export const GET: APIRoute = proxy;
export const POST: APIRoute = proxy;
