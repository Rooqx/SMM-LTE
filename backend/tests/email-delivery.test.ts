import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import type { ClaimedJob } from "../src/db/jobs.js";
import { PermanentJobError } from "../src/db/jobs.js";
import { EmailDeliveryService } from "../src/email/delivery.js";

const job: ClaimedJob = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "send_auth_email",
  attempts: 1,
  max_attempts: 6,
  payload: {
    kind: "email_verification",
    recipient: "owner@example.com",
    subject: "Verify your email",
    text: "Open the secure verification link.",
    idempotencyKey: "a".repeat(64),
  },
};

function service() {
  return new EmailDeliveryService(loadConfig({
    NODE_ENV: "test",
    AUTH_EMAIL_WEBHOOK_URL: "https://email-gateway.example.test/send",
    AUTH_EMAIL_WEBHOOK_TOKEN: "test-token-at-least-16-characters",
    AUTH_EMAIL_FROM: "noreply@example.com",
  }));
}

function resendService() {
  return new EmailDeliveryService(loadConfig({
    NODE_ENV: "test",
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_test_key_at_least_16_characters",
    AUTH_EMAIL_FROM: "noreply@example.com",
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EmailDeliveryService", () => {
  it("sends a bounded provider-neutral request with an idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await service().deliver(job);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://email-gateway.example.test/send");
    expect(new Headers(request.headers).get("idempotency-key")).toBe("a".repeat(64));
    expect(JSON.parse(String(request.body))).toMatchObject({
      from: "noreply@example.com",
      to: "owner@example.com",
      category: "email_verification",
    });
  });

  it("marks invalid payloads and non-retryable provider responses permanent", async () => {
    await expect(service().deliver({ ...job, type: "execute_workflow_run" }))
      .rejects.toBeInstanceOf(PermanentJobError);
    await expect(service().deliver({ ...job, payload: {} })).rejects.toBeInstanceOf(
      PermanentJobError,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 400 })),
    );
    await expect(service().deliver(job)).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("treats rate limiting as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 429 })),
    );
    await expect(service().deliver(job)).rejects.toThrow("unavailable (429)");
  });

  it("maps queued auth email to Resend without leaking provider details upstream", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await resendService().deliver(job);

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(request.headers);
    expect(url).toBe("https://api.resend.com/emails");
    expect(headers.get("authorization")).toBe(
      "Bearer re_test_key_at_least_16_characters",
    );
    expect(headers.get("idempotency-key")).toBe("a".repeat(64));
    expect(JSON.parse(String(request.body))).toEqual({
      from: "noreply@example.com",
      to: ["owner@example.com"],
      subject: "Verify your email",
      text: "Open the secure verification link.",
      tags: [{ name: "category", value: "email_verification" }],
    });
  });

  it("does not mistake a Resend idempotency conflict for successful delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 409 })),
    );

    await expect(resendService().deliver(job)).rejects.toThrow(
      "Resend auth email unavailable (409)",
    );
  });

  it("preserves the webhook gateway's documented duplicate acceptance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 409 })),
    );

    await expect(service().deliver(job)).resolves.toBeUndefined();
  });

  it("requires complete provider-specific configuration", () => {
    expect(() => loadConfig({
      NODE_ENV: "test",
      EMAIL_PROVIDER: "resend",
      AUTH_EMAIL_FROM: "noreply@example.com",
    })).toThrow("RESEND_API_KEY is required");

    expect(() => loadConfig({
      NODE_ENV: "test",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test_key_at_least_16_characters",
    })).toThrow("AUTH_EMAIL_FROM is required");

    expect(() => loadConfig({
      NODE_ENV: "test",
      RESEND_API_KEY: "re_test_key_at_least_16_characters",
      AUTH_EMAIL_WEBHOOK_URL: "https://email-gateway.example.test/send",
      AUTH_EMAIL_WEBHOOK_TOKEN: "test-token-at-least-16-characters",
      AUTH_EMAIL_FROM: "noreply@example.com",
    })).toThrow("EMAIL_PROVIDER is required");

    expect(() => loadConfig({
      NODE_ENV: "test",
      AUTH_EMAIL_FROM: "noreply@example.com",
    })).toThrow("EMAIL_PROVIDER is required");
  });
});
