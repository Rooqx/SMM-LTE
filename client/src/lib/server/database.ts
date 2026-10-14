import pg from "pg";
import { getServerConfig } from "./config";

const { Pool } = pg;

async function connectionString(): Promise<string> {
  if (process.env.DEPLOY_TARGET !== "cloudflare") {
    return getServerConfig().DATABASE_URL;
  }
  const { env } = await import("cloudflare:workers");
  const hyperdrive = (env as unknown as {
    HYPERDRIVE?: { connectionString?: string };
  }).HYPERDRIVE;
  if (!hyperdrive?.connectionString) {
    throw new Error("Cloudflare HYPERDRIVE binding is required");
  }
  return hyperdrive.connectionString;
}

/** Close after each request; Hyperdrive owns the long-lived connection pool. */
export async function createAuthPool(): Promise<pg.Pool> {
  const config = getServerConfig();
  const pool = new Pool({
    connectionString: await connectionString(),
    max: config.DEPLOY_TARGET === "cloudflare" ? 1 : config.DATABASE_POOL_MAX,
    application_name: "smm-auth-bff",
    statement_timeout: 15_000,
    query_timeout: 20_000,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
    ...(config.DEPLOY_TARGET !== "cloudflare" && config.DATABASE_SSL
      ? { ssl: { rejectUnauthorized: config.DATABASE_SSL_REJECT_UNAUTHORIZED } }
      : {}),
  });
  pool.on("connect", (client) => {
    client.on("error", (error) => {
      console.warn("Client database socket error", {
        name: error.name,
        code: (error as Error & { code?: string }).code,
      });
    });
  });
  pool.on("error", (error) => {
    // Avoid serializing the full driver object, which may include connection
    // metadata that does not belong in application logs. Driver messages are
    // omitted as they may repeat hostnames or database identifiers.
    console.error("Unexpected authentication database pool error", {
      name: error.name,
      code: (error as Error & { code?: string }).code,
    });
  });
  return pool;
}
