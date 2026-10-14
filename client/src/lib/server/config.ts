import "dotenv/config";
import { z } from "zod";

const optionalString = (minimumLength = 1) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(minimumLength).optional(),
  );

const httpUrl = z.url().transform((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    context.addIssue({ code: "custom", message: "must use HTTP or HTTPS" });
    return z.NEVER;
  }
  return url.toString();
});

const origin = httpUrl.transform((value) => new URL(value).origin);

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEPLOY_TARGET: z.enum(["node", "cloudflare"]).default("node"),
    SMM_API_BASE_URL: httpUrl.default("http://127.0.0.1:3001"),
    SMM_API_AUDIENCE: z.string().trim().min(3).max(200).default("smm-orchestrator-api"),
    DATABASE_URL: z
      .string()
      .min(1)
      .default("postgresql://smm:smm@localhost:5432/smm"),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().max(50).default(5),
    DATABASE_SSL: z.stringbool().default(false),
    DATABASE_SSL_REJECT_UNAUTHORIZED: z.stringbool().default(true),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: origin.default("http://localhost:4321"),
    AUTH_TRUSTED_ORIGINS: z.string().optional(),
    GOOGLE_CLIENT_ID: optionalString(),
    GOOGLE_CLIENT_SECRET: optionalString(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.GOOGLE_CLIENT_ID) !== Boolean(value.GOOGLE_CLIENT_SECRET)) {
      context.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "Google client ID and secret must be configured together",
      });
    }

    if (value.NODE_ENV === "production") {
      if (value.DEPLOY_TARGET === "cloudflare" &&
          new URL(value.SMM_API_BASE_URL).hostname === "127.0.0.1") {
        context.addIssue({ code: "custom", path: ["SMM_API_BASE_URL"],
          message: "Cloudflare requires the public Render API URL" });
      }
      if (new URL(value.BETTER_AUTH_URL).protocol !== "https:") {
        context.addIssue({
          code: "custom",
          path: ["BETTER_AUTH_URL"],
          message: "Production authentication requires HTTPS",
        });
      }
      if (value.BETTER_AUTH_SECRET.includes("replace")) {
        context.addIssue({
          code: "custom",
          path: ["BETTER_AUTH_SECRET"],
          message: "Production cannot use an example authentication secret",
        });
      }
    }
  });

type ParsedEnvironment = z.infer<typeof EnvironmentSchema>;

export type ServerConfig = Omit<ParsedEnvironment, "AUTH_TRUSTED_ORIGINS"> & {
  AUTH_TRUSTED_ORIGINS: readonly string[];
  GOOGLE_ENABLED: boolean;
};

let cachedConfig: ServerConfig | undefined;

function trustedOrigins(value: string | undefined, baseUrl: string): readonly string[] {
  const configured = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => origin.parse(item));
  return [...new Set([baseUrl, ...configured])];
}

/**
 * Parses server-only configuration once per process. Keeping this module free
 * of Astro virtual imports makes it reusable by tests and server entry points.
 */
export function getServerConfig(): ServerConfig {
  if (cachedConfig) return cachedConfig;

  const parsed = EnvironmentSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server configuration: ${parsed.error.issues
        .map((issue) => issue.path.join(".") || issue.message)
        .join(", ")}`,
    );
  }

  const exactOrigins = trustedOrigins(
    parsed.data.AUTH_TRUSTED_ORIGINS,
    parsed.data.BETTER_AUTH_URL,
  );
  if (
    parsed.data.NODE_ENV === "production" &&
    exactOrigins.some((value) => new URL(value).protocol !== "https:")
  ) {
    throw new Error(
      "Invalid server configuration: AUTH_TRUSTED_ORIGINS must use HTTPS in production",
    );
  }

  const config: ServerConfig = {
    ...parsed.data,
    AUTH_TRUSTED_ORIGINS: exactOrigins,
    GOOGLE_ENABLED: Boolean(
      parsed.data.GOOGLE_CLIENT_ID && parsed.data.GOOGLE_CLIENT_SECRET,
    ),
  };
  cachedConfig = config;
  return config;
}

/** Test-only reset for isolated configuration cases. */
export function resetServerConfigForTests(): void {
  cachedConfig = undefined;
}
