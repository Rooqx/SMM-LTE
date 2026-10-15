import pg from "pg";
import { getServerConfig } from "./config";

const { Pool } = pg;

let devPool: pg.Pool | undefined;

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

/**
 * Creates or retrieves the database pool.
 * In local Node development, reuses a single shared pool to avoid connection exhaustion and TLS handshakes per request.
 * In Cloudflare Workers, creates a 1-connection pool that Hyperdrive pools upstream.
 */
export async function createAuthPool(): Promise<pg.Pool> {
  const config = getServerConfig();

  // In Node.js / local dev, reuse a single shared pool across requests
  if (config.DEPLOY_TARGET !== "cloudflare") {
    if (devPool && !devPool.ended && !devPool.ending) {
      return devPool;
    }

    devPool = new Pool({
      connectionString: config.DATABASE_URL,
      max: config.DATABASE_POOL_MAX,
      application_name: "smm-auth-bff",
      statement_timeout: 15_000,
      query_timeout: 20_000,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      ...(config.DATABASE_SSL
        ? { ssl: { rejectUnauthorized: config.DATABASE_SSL_REJECT_UNAUTHORIZED } }
        : {}),
    });

    devPool.on("error", (error) => {
      // In development, ignore routine disconnects on idle pool clients
      if ((error as { code?: string }).code === "57P01") return;
      if (config.NODE_ENV !== "production") {
        console.warn("Database pool notice:", error.message || error.name);
      }
    });

    return devPool;
  }

  // Cloudflare Workers mode: Hyperdrive owns the pool, 1 connection per worker request
  const pool = new Pool({
    connectionString: await connectionString(),
    max: 1,
    application_name: "smm-auth-bff",
    statement_timeout: 15_000,
    query_timeout: 20_000,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
  });

  pool.on("error", (error) => {
    // pg-cloudflare emits 'This socket has been closed.' when a socket is closed on pool.end()
    if (error.message?.includes("This socket has been closed")) return;
    if ((error as { code?: string }).code === "57P01") return;
    console.error("Unexpected authentication database pool error", error);
  });

  return pool;
}
