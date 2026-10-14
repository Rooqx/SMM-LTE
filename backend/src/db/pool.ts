import dns from "node:dns";
import net from "node:net";
import pg from "pg";
import type { AppConfig } from "../config.js";

dns.setDefaultResultOrder("ipv4first");
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}

const { Pool } = pg;

export function createPool(config: AppConfig): pg.Pool {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    application_name: "smm-orchestrator",
    statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
    query_timeout: config.DATABASE_QUERY_TIMEOUT_MS,
    lock_timeout: config.DATABASE_LOCK_TIMEOUT_MS,
    idle_in_transaction_session_timeout: config.DATABASE_IDLE_TRANSACTION_TIMEOUT_MS,
    connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    ...(config.DATABASE_SSL
      ? { ssl: { rejectUnauthorized: config.DATABASE_SSL_REJECT_UNAUTHORIZED } }
      : {}),
  });
  pool.on("connect", (client) => {
    client.on("error", (error) => {
      console.warn("PostgreSQL client socket error", {
        name: error.name,
        message: error.message,
        code: (error as Error & { code?: string }).code,
      });
    });
  });
  pool.on("error", (error) => {
    // Idle-client failures cannot be attributed to a request; the pool will replace the client.
    // Log only operational fields, not the full driver object/connection metadata.
    console.error("Unexpected PostgreSQL pool error", {
      name: error.name,
      message: error.message,
      code: (error as Error & { code?: string }).code,
    });
  });
  return pool;
}
