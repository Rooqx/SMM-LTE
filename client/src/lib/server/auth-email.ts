import { createHash } from "node:crypto";
import type pg from "pg";
import { PRODUCT_CONFIG } from "@/config/product";

export type AuthEmailKind = "email_verification" | "password_reset";

type AuthEmail = {
  kind: AuthEmailKind;
  recipient: string;
  recipientName: string;
  actionUrl: string;
};

const content = {
  email_verification: {
    subject: `Verify your ${PRODUCT_CONFIG.name} email`,
    introduction: `Verify your email address to activate your ${PRODUCT_CONFIG.name} account.`,
  },
  password_reset: {
    subject: `Reset your ${PRODUCT_CONFIG.name} password`,
    introduction: `Use this secure link to choose a new ${PRODUCT_CONFIG.name} password.`,
  },
} as const;

/**
 * Commits auth mail to the shared durable queue before returning. The worker
 * owns provider delivery and retries, so auth does not depend on one vendor.
 */
export async function enqueueAuthEmail(pool: pg.Pool, message: AuthEmail): Promise<void> {
  const template = content[message.kind];
  const recipient = message.recipient.trim().toLowerCase();
  const idempotencyKey = createHash("sha256")
    .update(`${message.kind}\u0000${recipient}\u0000${message.actionUrl}`)
    .digest("hex");
  const text = [
    `Hello ${message.recipientName.trim() || "there"},`,
    "",
    template.introduction,
    "",
    message.actionUrl,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  await pool.query(
    `INSERT INTO job_queue(type, payload, max_attempts, correlation_id)
     VALUES ('send_auth_email', $1, 6, $2)
     ON CONFLICT DO NOTHING`,
    [
      {
        kind: message.kind,
        recipient,
        subject: template.subject,
        text,
        idempotencyKey,
      },
      `auth-email:${idempotencyKey.slice(0, 32)}`,
    ],
  );
}
