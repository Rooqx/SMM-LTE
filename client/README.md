# Signal Studio client

Astro server-rendered frontend for the SMM orchestration backend. The browser talks only to same-origin Astro API routes; the Astro server adds the backend service credential.

## Run locally

Requirements: Node.js 22+, pnpm 11+, the backend API, and PostgreSQL configured by the backend.

```bash
cd client
cp .env.example .env
pnpm install
pnpm dev
```

Open `http://localhost:4321`. Set a unique `BETTER_AUTH_SECRET` of at least 32 characters and point `DATABASE_URL` at the same PostgreSQL database used by Fastify. Do not prefix secrets with `PUBLIC_`.

The Astro server exposes Better Auth under `/api/auth/*`. It exchanges a verified HttpOnly session for a short-lived assertion when calling Fastify; no service key or assertion is stored in browser storage. Google sign-in is enabled only when both Google credentials are configured.

The existing visual login/logout controls have intentionally not been migrated as part of the backend milestone. The server endpoints are ready; wire those controls only in the separate frontend implementation task.

Cloudflare production build and configuration:

```bash
pnpm build
pnpm deploy:dry-run
```

The production frontend runs on Cloudflare Workers with Hyperdrive for the
shared Neon database. See [the deployment guide](../docs/cloudflare-render-deploy.md)
for role grants, runtime secrets, Render API settings, and deployment checks.

## Quality commands

```bash
pnpm check
pnpm test
pnpm build
```

End-to-end tests are intentionally separate because they start a browser and a local Astro server:

```bash
pnpm exec playwright install chrome
pnpm test:e2e
```

Read the [end-to-end testing guide](docs/e2e-testing.md) before running or extending them.

## Documentation

- [Features](docs/features.md)
- [Architecture decisions](docs/architecture.md)
- [Security model](docs/security.md)
- [Backend contract and gaps](docs/backend-contract.md)
- [End-to-end testing](docs/e2e-testing.md)
- [Engineering audit](docs/audit.md)
