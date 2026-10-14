# Cloudflare Workers frontend and Render Free API/worker

The Astro frontend is one Cloudflare Worker. The Fastify API and PostgreSQL job
worker are two child processes in one Render Free web service. Neon holds both
auth and application data. No database migration or cloud resource is created
by adding these files.

## 1. Prepare Neon

Use the existing Neon database. In Neon, create a separate role for Cloudflare
auth and use its **direct (unpooled)** connection string to create a Cloudflare
Hyperdrive configuration. Do not use Neon's `-pooler` hostname for Hyperdrive.
The Render service can use its existing Neon connection string.

Apply the existing backend migrations with the backend owner role before using
the Cloudflare auth role. Then grant only its required privileges:

```sh
psql "$DATABASE_URL" -v auth_role=YOUR_NEON_AUTH_ROLE \
  -f backend/scripts/grant-auth-role.sql
```

The auth role can read and write Better Auth's six tables and insert email jobs
into `job_queue`. It cannot claim jobs or edit application tables. Verify grants
again after any migration that changes the auth schema.

## 2. Configure Cloudflare

From `client/`, install with `pnpm install --frozen-lockfile`, then build with
`pnpm build`. Set `client/wrangler.jsonc`'s `HYPERDRIVE` id to the ID returned
when you create the Hyperdrive configuration. Keep database credentials in
Hyperdrive, not Wrangler variables or frontend browser code.

Set these Worker runtime secrets/variables in Cloudflare before deploying:

| Name | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | Unique random secret of at least 32 characters |
| `BETTER_AUTH_URL` | Final `https://` frontend origin, without a path |
| `SMM_API_BASE_URL` | Render service's public `https://` origin |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Both, only if Google login is enabled |

`DEPLOY_TARGET=cloudflare` and `SMM_API_AUDIENCE=smm-orchestrator-api` are in
Wrangler. `NODE_ENV` is set to production by the Cloudflare build. Configure a
single public frontend origin; if Google login is used, register
`<BETTER_AUTH_URL>/api/auth/callback/google` with Google.

Run `pnpm build`, `pnpm exec wrangler deploy --dry-run`, then deploy from the
`client/` directory with `pnpm deploy` after the checks below pass. The deploy
script rejects the placeholder Hyperdrive ID. For a local Cloudflare runtime
test, set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` to a test
database URL and use `pnpm exec wrangler dev`. Never put a database password in
`wrangler.jsonc` or commit `.dev.vars`.

## 3. Configure Render

Create one Blueprint from `render.yaml`. The repository root must be available
at runtime because the API reads the numbered skill directories and top-level
Markdown files. The start command migrates the database once under an advisory
lock, then starts the API and job worker. A failed migration prevents startup.

Fill in Render's secret fields. `AUTH_JWKS_URL` is
`<BETTER_AUTH_URL>/api/auth/jwks`; `AUTH_TOKEN_ISSUER` is exactly
`BETTER_AUTH_URL`. The audience is already set to
`smm-orchestrator-api` in both configs. `DATABASE_URL` is the Neon URL for the
backend owner role. Set a verified `AUTH_EMAIL_FROM`, Resend key, OpenAI key,
and a distinct high-entropy metrics token. The API binds Render's `PORT`.

Render checks `/ready`, which verifies PostgreSQL, migration 017, and the active
skill release. Configure your external uptime service to GET
`https://YOUR-RENDER-SERVICE.onrender.com/health` every 10 minutes. `/health`
only checks that HTTP responds; monitor `/ready` separately for application
readiness. Render Free may restart or suspend the service despite pings.

## 4. Verify before real users

1. Run client `astro check`, `astro build`, and Wrangler dry run; run backend
   typecheck and build. Check the browser assets contain no credentials.
2. Against a disposable Neon branch, test sign-up, verification email, sign-in,
   session lookup, JWKS, an authenticated API request, and one queued model job.
3. Restart the Render service and confirm the worker resumes the queued job.
   Verify both processes stop when Render sends `SIGTERM`.
4. Observe Cloudflare invocation CPU and error 1102 counts. Workers Free has a
   10 ms CPU budget per HTTP request; auth and SSR must run without repeated
   limit errors. Monitor Hyperdrive query use, Render `/ready`, and job backlog.

Production resource creation, migrations against the live Neon database, and
cloud deployments are separate rollout steps.
