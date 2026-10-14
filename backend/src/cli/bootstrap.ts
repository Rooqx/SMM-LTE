import { z } from "zod";
import { ApiKeyService } from "../auth/api-keys.js";
import { loadConfig } from "../config.js";
import { createPool } from "../db/pool.js";

const Slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const organizationNameArgument = argument("--organization-name");
const organizationSlugArgument = argument("--organization-slug");
if (!organizationNameArgument || !organizationSlugArgument) {
  throw new Error(
    "Usage: pnpm run bootstrap -- --organization-name <name> --organization-slug <slug> [--key-name <name>]",
  );
}
const organizationName = z.string().min(1).max(160).parse(organizationNameArgument);
const organizationSlug = Slug.parse(organizationSlugArgument);
const keyName = z.string().min(1).max(120).parse(argument("--key-name") ?? "bootstrap");

const config = loadConfig();
const pool = createPool(config);

try {
  const result = await pool.query(
    `INSERT INTO organizations(name, slug) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
     RETURNING id, name, slug`,
    [organizationName, organizationSlug],
  );
  const organization = result.rows[0] as { id: string; name: string; slug: string };
  const apiKey = await new ApiKeyService(pool).issue({
    organizationId: organization.id,
    name: keyName,
  });

  // The plaintext token is intentionally emitted once and is never stored by the service.
  console.log(
    JSON.stringify(
      {
        organization,
        apiKey: { id: apiKey.id, name: keyName, token: apiKey.token },
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
