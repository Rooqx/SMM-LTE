// @vitest-environment node
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

integration("Better Auth PostgreSQL integration", () => {
  let pool: pg.Pool;
  let handler: (request: Request) => Promise<Response>;
  let publicAuthRoute: (context: {
    url: URL;
    request: Request;
    clientAddress: string;
  }) => Promise<Response>;

  beforeAll(async () => {
    if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL = "false";
    process.env.NODE_ENV = "test";
    process.env.BETTER_AUTH_SECRET = "integration-only-secret-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "http://localhost:4321";

    const [{ createAuth }, database, route] = await Promise.all([
      import("./auth"),
      import("./database"),
      import("../../pages/api/auth/[...all]"),
    ]);
    pool = await database.createAuthPool();
    handler = createAuth(pool).handler;
    publicAuthRoute = (async (context) => {
      const locals = {};
      try {
        return await route.ALL({ ...context, locals } as Parameters<typeof route.ALL>[0]);
      } finally {
        const { closeRequestAuth } = await import("./request-auth");
        await closeRequestAuth({ locals } as Parameters<typeof closeRequestAuth>[0]);
      }
    }) as typeof publicAuthRoute;
    await pool.query('TRUNCATE "user" CASCADE');
    await pool.query("DELETE FROM job_queue WHERE type = 'send_auth_email'");
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  function authRequest(path: string, body?: Record<string, unknown>, cookie?: string) {
    return new Request(`http://localhost:4321/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        origin: "http://localhost:4321",
        ...(body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  it("gates sessions on verification and enqueues durable auth email jobs", async () => {
    const email = "integration-owner@example.com";
    const password = "correct horse battery staple";
    const signUp = await handler(authRequest("/sign-up/email", {
      name: "Integration Owner",
      email,
      password,
      callbackURL: "/login?verified=1",
    }));
    expect(signUp.status).toBe(200);

    const verificationJobs = await pool.query(
      `SELECT payload FROM job_queue
       WHERE type = 'send_auth_email'
         AND payload->>'kind' = 'email_verification'`,
    );
    expect(verificationJobs.rowCount).toBe(1);
    expect(verificationJobs.rows[0]?.payload).toMatchObject({
      recipient: email,
      kind: "email_verification",
    });

    const beforeVerification = await handler(authRequest("/sign-in/email", {
      email,
      password,
    }));
    expect(beforeVerification.status).toBe(403);

    await pool.query('UPDATE "user" SET "emailVerified" = true WHERE email = $1', [email]);
    const signInRequest = authRequest("/sign-in/email", { email, password });
    const signIn = await publicAuthRoute({
      url: new URL(signInRequest.url),
      request: signInRequest,
      clientAddress: "127.0.0.1",
    });
    expect(signIn.status).toBe(200);
    expect(await signIn.clone().json()).not.toHaveProperty("token");
    const sessionCookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
    expect(sessionCookie).toContain("smm.session_token=");

    const sessionRequest = authRequest("/get-session", undefined, sessionCookie);
    const publicSession = await publicAuthRoute({
      url: new URL(sessionRequest.url),
      request: sessionRequest,
      clientAddress: "127.0.0.1",
    });
    expect(((await publicSession.json()) as { session?: Record<string, unknown> }).session).not.toHaveProperty("token");

    const tokenResponse = await handler(authRequest("/token", undefined, sessionCookie));
    expect(tokenResponse.status).toBe(200);
    const tokenBody = await tokenResponse.json() as { token?: string };
    expect(tokenBody.token?.split(".")).toHaveLength(3);

    const reset = await handler(authRequest("/request-password-reset", {
      email,
      redirectTo: "/reset-password",
    }));
    expect(reset.status).toBe(200);
    expect((await pool.query(
      `SELECT 1 FROM job_queue
       WHERE type = 'send_auth_email'
         AND payload->>'kind' = 'password_reset'`,
    )).rowCount).toBe(1);
  }, 30_000);

  it("does not expose the internal Fastify assertion endpoint to browsers", async () => {
    for (const path of ["/api/auth/token", "/api/auth/token/"]) {
      const request = authRequest(path.replace("/api/auth", ""));
      const response = await publicAuthRoute({
        url: new URL(request.url),
        request,
        clientAddress: "127.0.0.1",
      });
      expect(response.status).toBe(404);
    }
  });
});
