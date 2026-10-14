import type { APIContext } from "astro";
import { createAuth, type Auth } from "./auth";
import { createAuthPool } from "./database";

export async function getRequestAuth(context: Pick<APIContext, "locals">): Promise<Auth> {
  if (context.locals.authRuntime) return context.locals.authRuntime.auth;
  const pool = await createAuthPool();
  try {
    const auth = createAuth(pool);
    context.locals.authRuntime = { auth, pool };
    return auth;
  } catch (error) {
    await pool.end();
    throw error;
  }
}

export async function closeRequestAuth(context: Pick<APIContext, "locals">): Promise<void> {
  const runtime = context.locals.authRuntime;
  delete context.locals.authRuntime;
  if (runtime) await runtime.pool.end();
}
