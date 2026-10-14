import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://smm:smm@localhost:5432/smm"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_SSL: z.stringbool().default(false),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.stringbool().default(true),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(310_000).default(35_000),
  DATABASE_LOCK_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5_000),
  DATABASE_IDLE_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(10_000),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  CORS_ORIGIN: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  HTTP_BODY_LIMIT_BYTES: z.coerce.number().int().min(16_384).max(2_097_152).default(524_288),
  HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  HTTP_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(200),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  METRICS_BEARER_TOKEN: z.string().min(32).optional(),
  PERFORMANCE_TRACE_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  // Controls selection of guided intake for workspaces that do not already
  // have a pinned interview authority. Existing sessions always remain
  // resumable so a rollback cannot strand user data.
  GUIDED_INTAKE_ENABLED: z.stringbool().default(true),
  AUTH_JWKS_URL: z.url().default("http://localhost:4321/api/auth/jwks"),
  AUTH_TOKEN_ISSUER: z.url().default("http://localhost:4321"),
  AUTH_TOKEN_AUDIENCE: z.string().trim().min(3).max(200).default("smm-orchestrator-api"),
  AUTH_ASSERTION_MAX_AGE_SECONDS: z.coerce.number().int().min(30).max(300).default(90),
  EMAIL_PROVIDER: z.enum(["webhook", "resend"]).optional(),
  RESEND_API_KEY: z.string().trim().min(16).optional(),
  AUTH_EMAIL_WEBHOOK_URL: z.url().optional(),
  AUTH_EMAIL_WEBHOOK_TOKEN: z.string().min(16).optional(),
  AUTH_EMAIL_FROM: z.string().email().optional(),
  AUTH_EMAIL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
  LLM_PROVIDER: z.string().default("mock"),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  SKILLS_ROOT: z.string().default(path.resolve(moduleDirectory, "../..")),
  WORKER_ID: z.string().default(`worker-${process.pid}`),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(4),
  WORKER_RECOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  WORKER_MODEL_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(2),
  WORKER_MAX_CONCURRENT_JOBS_PER_ORGANIZATION: z.coerce.number().int().min(1).max(64).default(2),
  WORKER_LEASE_SECONDS: z.coerce.number().int().min(15).max(3_600).default(180),
  WORKER_LEASE_RENEW_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  WORKER_SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1_000).max(900_000).default(330_000),
  QUEUE_MAX_ACTIVE_JOBS: z.coerce.number().int().min(1).max(1_000_000).default(10_000),
  QUEUE_MAX_ACTIVE_JOBS_PER_ORGANIZATION: z.coerce.number().int().min(1).max(10_000).default(20),
  MAX_ORGANIZATION_MODEL_TOKENS_PER_DAY: z.coerce.number().int().min(1_000).max(1_000_000_000).default(2_000_000),
  MAX_ORGANIZATION_ESTIMATED_COST_MICRO_USD_PER_DAY: z.coerce.number().int().min(1).max(1_000_000_000_000).default(5_000_000),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  // Keep provider retries shallow. The durable job queue owns broader retries
  // and preserves attempt history across process restarts.
  OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(100_000).default(12_000),
  OPTION_ASSISTANT_TIMEOUT_MS: z.coerce.number().int().min(500).max(10_000).default(5_000),
  OPTION_ASSISTANT_CACHE_TTL_MS: z.coerce.number().int().min(60_000).max(604_800_000)
    .default(86_400_000),
  OPTION_ASSISTANT_INPUT_COST_MICRO_USD_PER_MILLION: z.coerce.number()
    .min(0).max(1_000_000_000).default(0),
  OPTION_ASSISTANT_OUTPUT_COST_MICRO_USD_PER_MILLION: z.coerce.number()
    .min(0).max(1_000_000_000).default(0),
  MAX_CONTEXT_CHARS: z.coerce.number().int().positive().default(120_000),
  MEMORY_CONTEXT_MAX_CHARS: z.coerce.number().int().min(1_000).max(500_000).default(60_000),
  MEMORY_CONVERSATION_MAX_CHARS: z.coerce.number().int().min(1_000).max(200_000).default(30_000),
  MEMORY_RECENT_MESSAGES: z.coerce.number().int().min(1).max(100).default(20),
  MAX_MODEL_ACTIONS_PER_RUN: z.coerce.number().int().min(1).max(10).default(4),
  MAX_MODEL_TOKENS_PER_RUN: z.coerce.number().int().min(1_000).max(1_000_000).default(60_000),
  MAX_RUN_DURATION_MS: z.coerce.number().int().min(1_000).max(1_800_000).default(300_000),
  MAX_OPTIONAL_SKILL_DEPTH: z.coerce.number().int().min(0).max(2).default(1),
  MAX_TOOL_RESULT_BYTES: z.coerce.number().int().min(1_000).max(180_000).default(30_000),
  MODEL_INPUT_COST_MICRO_USD_PER_MILLION: z.coerce.number().min(0).max(1_000_000_000).default(0),
  MODEL_OUTPUT_COST_MICRO_USD_PER_MILLION: z.coerce.number().min(0).max(1_000_000_000).default(0),
  OBSIDIAN_MAX_EXPORT_FILES: z.coerce.number().int().min(1).max(100_000).default(5_000),
  OBSIDIAN_MAX_EXPORT_BYTES: z.coerce.number().int().min(1_000).max(1_000_000_000).default(50_000_000),
  OBSIDIAN_EXPORT_ROOT: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvironmentSchema> & {
  EMAIL_PROVIDER: "webhook" | "resend" | undefined;
  LLM_PROVIDER: "mock" | "openai";
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvironmentSchema.parse(environment);

  if (parsed.WORKER_MODEL_CONCURRENCY > parsed.WORKER_CONCURRENCY) {
    throw new Error("WORKER_MODEL_CONCURRENCY must not exceed WORKER_CONCURRENCY");
  }
  if (parsed.WORKER_LEASE_RENEW_MS >= parsed.WORKER_LEASE_SECONDS * 500) {
    throw new Error("WORKER_LEASE_RENEW_MS must be less than half of WORKER_LEASE_SECONDS");
  }
  if (parsed.DATABASE_QUERY_TIMEOUT_MS < parsed.DATABASE_STATEMENT_TIMEOUT_MS) {
    throw new Error("DATABASE_QUERY_TIMEOUT_MS must be at least DATABASE_STATEMENT_TIMEOUT_MS");
  }
  if (parsed.WORKER_SHUTDOWN_GRACE_MS < parsed.MAX_RUN_DURATION_MS) {
    throw new Error("WORKER_SHUTDOWN_GRACE_MS must be at least MAX_RUN_DURATION_MS");
  }
  if (parsed.OPENAI_TIMEOUT_MS * (parsed.OPENAI_MAX_RETRIES + 1) >= parsed.MAX_RUN_DURATION_MS) {
    throw new Error(
      "OPENAI timeout and retries must fit inside MAX_RUN_DURATION_MS",
    );
  }

  if (parsed.NODE_ENV === "production") {
    for (const [name, value] of [
      ["AUTH_JWKS_URL", parsed.AUTH_JWKS_URL],
      ["AUTH_TOKEN_ISSUER", parsed.AUTH_TOKEN_ISSUER],
    ] as const) {
      if (new URL(value).protocol !== "https:") {
        throw new Error(`${name} must use HTTPS in production`);
      }
    }
    if (!parsed.METRICS_BEARER_TOKEN) {
      throw new Error("METRICS_BEARER_TOKEN is required in production");
    }
  }

  const configuredWebhookValues = [
    parsed.AUTH_EMAIL_WEBHOOK_URL,
    parsed.AUTH_EMAIL_WEBHOOK_TOKEN,
  ].filter(Boolean).length;
  if (configuredWebhookValues === 1) {
    throw new Error(
      "AUTH_EMAIL_WEBHOOK_URL and AUTH_EMAIL_WEBHOOK_TOKEN must be configured together",
    );
  }

  const inferredEmailProvider = parsed.RESEND_API_KEY
    ? "resend"
    : configuredWebhookValues === 2
      ? "webhook"
      : undefined;
  if (!parsed.EMAIL_PROVIDER && parsed.RESEND_API_KEY && configuredWebhookValues === 2) {
    throw new Error(
      "EMAIL_PROVIDER is required when both Resend and webhook credentials are configured",
    );
  }
  const emailProvider = parsed.EMAIL_PROVIDER ?? inferredEmailProvider;

  if (!emailProvider && parsed.AUTH_EMAIL_FROM) {
    throw new Error("EMAIL_PROVIDER is required when AUTH_EMAIL_FROM is configured");
  }
  if (emailProvider === "resend" && !parsed.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }
  if (
    emailProvider === "webhook" &&
    (!parsed.AUTH_EMAIL_WEBHOOK_URL || !parsed.AUTH_EMAIL_WEBHOOK_TOKEN)
  ) {
    throw new Error(
      "AUTH_EMAIL_WEBHOOK_URL and AUTH_EMAIL_WEBHOOK_TOKEN are required when EMAIL_PROVIDER=webhook",
    );
  }
  if (emailProvider && !parsed.AUTH_EMAIL_FROM) {
    throw new Error("AUTH_EMAIL_FROM is required when email delivery is enabled");
  }
  if (parsed.NODE_ENV === "production" && !emailProvider) {
    throw new Error(
      "EMAIL_PROVIDER and its credentials are required in production",
    );
  }
  if (
    parsed.NODE_ENV === "production" &&
    emailProvider === "webhook" &&
    new URL(parsed.AUTH_EMAIL_WEBHOOK_URL!).protocol !== "https:"
  ) {
    throw new Error("AUTH_EMAIL_WEBHOOK_URL must use HTTPS in production");
  }

  let llmProvider = parsed.LLM_PROVIDER;
  let openaiBaseUrl = parsed.OPENAI_BASE_URL;

  if (llmProvider.startsWith("http://") || llmProvider.startsWith("https://")) {
    openaiBaseUrl = llmProvider;
    llmProvider = "openai";
  }

  if (llmProvider !== "mock" && llmProvider !== "openai") {
    throw new Error(`Unsupported LLM_PROVIDER: '${llmProvider}'. Expected 'mock' or 'openai' (or an API URL).`);
  }

  if (llmProvider === "openai" && !parsed.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
  }

  return {
    ...parsed,
    EMAIL_PROVIDER: emailProvider,
    LLM_PROVIDER: llmProvider as "mock" | "openai",
    OPENAI_BASE_URL: openaiBaseUrl,
    SKILLS_ROOT: path.resolve(parsed.SKILLS_ROOT),
    ...(parsed.OBSIDIAN_EXPORT_ROOT
      ? { OBSIDIAN_EXPORT_ROOT: path.resolve(parsed.OBSIDIAN_EXPORT_ROOT) }
      : {}),
  };
}
