import { z } from "zod";
import type { AppConfig } from "../config.js";
import { PermanentJobError, type ClaimedJob } from "../db/jobs.js";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

const AuthEmailPayload = z.object({
  kind: z.enum(["email_verification", "password_reset"]),
  recipient: z.string().email().max(320),
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(20_000),
  idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/),
});

/**
 * A small provider boundary for transactional auth mail. Hosting can connect
 * any email vendor behind the same HTTPS contract without coupling auth code
 * or durable queue semantics to that vendor's SDK.
 */
export class EmailDeliveryService {
  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.EMAIL_PROVIDER);
  }

  async deliver(job: ClaimedJob): Promise<void> {
    if (job.type !== "send_auth_email") {
      throw new PermanentJobError("Email delivery received an unsupported job type");
    }
    const payload = AuthEmailPayload.safeParse(job.payload);
    if (!payload.success) {
      throw new PermanentJobError("Auth email job payload failed validation");
    }
    if (!this.config.EMAIL_PROVIDER || !this.config.AUTH_EMAIL_FROM) {
      throw new Error("Auth email delivery is not configured");
    }

    if (this.config.EMAIL_PROVIDER === "resend") {
      await this.deliverWithResend(payload.data);
      return;
    }

    await this.deliverWithWebhook(payload.data);
  }

  private async deliverWithResend(payload: z.infer<typeof AuthEmailPayload>): Promise<void> {
    if (!this.config.RESEND_API_KEY) {
      throw new Error("Resend email delivery is not configured");
    }

    const response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.config.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": payload.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.config.AUTH_EMAIL_FROM,
        to: [payload.recipient],
        subject: payload.subject,
        text: payload.text,
        tags: [{ name: "category", value: payload.kind }],
      }),
      signal: AbortSignal.timeout(this.config.AUTH_EMAIL_TIMEOUT_MS),
    });

    await response.body?.cancel();

    if (response.ok) return;
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 409 &&
      response.status !== 429
    ) {
      throw new PermanentJobError(`Resend rejected auth email (${response.status})`);
    }
    // Resend uses 409 for concurrent or payload-conflicting idempotency
    // requests. Neither proves delivery, so the durable queue must retry or
    // eventually dead-letter the job instead of falsely marking it complete.
    throw new Error(`Resend auth email unavailable (${response.status})`);
  }

  private async deliverWithWebhook(payload: z.infer<typeof AuthEmailPayload>): Promise<void> {
    if (!this.config.AUTH_EMAIL_WEBHOOK_URL || !this.config.AUTH_EMAIL_WEBHOOK_TOKEN) {
      throw new Error("Webhook email delivery is not configured");
    }

    const response = await fetch(this.config.AUTH_EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.config.AUTH_EMAIL_WEBHOOK_TOKEN}`,
        "content-type": "application/json",
        "idempotency-key": payload.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.config.AUTH_EMAIL_FROM,
        to: payload.recipient,
        subject: payload.subject,
        text: payload.text,
        category: payload.kind,
      }),
      signal: AbortSignal.timeout(this.config.AUTH_EMAIL_TIMEOUT_MS),
    });

    // The provider body is intentionally ignored. Cancel it so an oversized or
    // streaming error response cannot consume memory while we only need status.
    await response.body?.cancel();

    // An idempotent gateway may report an already-accepted message as conflict.
    if (response.ok || response.status === 409) return;
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429
    ) {
      throw new PermanentJobError(`Auth email provider rejected request (${response.status})`);
    }
    throw new Error(`Auth email provider unavailable (${response.status})`);
  }
}
