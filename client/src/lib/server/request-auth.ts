import type { APIContext } from "astro";
import { createAuth, type Auth } from "./auth";
import { createAuthPool } from "./database";

let devAuth: Auth | undefined;

export async function getRequestAuth(context: Pick<APIContext, "locals">): Promise<Auth> {
  if (context.locals.authRuntime) return context.locals.authRuntime.auth;
  const pool = await createAuthPool();
  try {
    if (process.env.DEPLOY_TARGET !== "cloudflare") {
      if (!devAuth) {
        devAuth = createAuth(pool);
      }
      context.locals.authRuntime = { auth: devAuth, pool };
      return devAuth;
    }
    const auth = createAuth(pool);
    context.locals.authRuntime = { auth, pool };
    return auth;
  } catch (error) {
    if (process.env.DEPLOY_TARGET === "cloudflare") {
      await pool.end();
    }
    throw error;
  }
}

export async function closeRequestAuth(context: Pick<APIContext, "locals">): Promise<void> {
  const runtime = context.locals.authRuntime;
  delete context.locals.authRuntime;
  // Cloudflare Hyperdrive creates a per-request pool that must be closed after each request.
  // In local Node development, the singleton pool stays open across requests.
  if (runtime && process.env.DEPLOY_TARGET === "cloudflare") {
    await runtime.pool.end();
  }
}
