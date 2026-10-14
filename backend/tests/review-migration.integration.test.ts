import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/db/migrations",
);

integration("M5 forward-only migration", () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("backfills existing run and artifact revision identities without losing history", async () => {
    const schema = `m5_upgrade_${randomUUID().replaceAll("-", "")}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}, public`);
      for (const migration of [
        "001_initial.sql",
        "002_relax_organization_slug.sql",
        "003_security_and_reliability.sql",
        "004_better_auth.sql",
        "005_personal_accounts_and_auth_email.sql",
        "006_durable_workflow_memory.sql",
        "007_typed_recipes_and_skill_bundles.sql",
        "008_release_pin_integrity.sql",
      ]) {
        await client.query(await readFile(path.join(migrationsDirectory, migration), "utf8"));
      }
      const organization = await client.query(
        "INSERT INTO organizations(name, slug) VALUES ('Legacy Review', 'legacy-review') RETURNING id",
      );
      const workspace = await client.query(
        `INSERT INTO workspaces(organization_id, name, slug)
         VALUES ($1, 'Legacy Review Brand', 'legacy-review-brand') RETURNING id`,
        [organization.rows[0]?.id],
      );
      const run = await client.query(
        `INSERT INTO workflow_runs(
           workspace_id, phase, skill_name, status, complete_phase, output_status
         ) VALUES ($1, 1, 'voice-builder', 'completed', false, 'accepted')
         RETURNING id`,
        [workspace.rows[0]?.id],
      );
      const first = await client.query(
        `INSERT INTO artifacts(
           workspace_id, run_id, kind, slug, title, content, version, status
         ) VALUES ($1, $2, 'voice-guide', 'voice', 'Voice v1', 'First', 1, 'approved')
         RETURNING id`,
        [workspace.rows[0]?.id, run.rows[0]?.id],
      );
      const second = await client.query(
        `INSERT INTO artifacts(
           workspace_id, run_id, kind, slug, title, content, version, status
         ) VALUES ($1, $2, 'voice-guide', 'voice', 'Voice v2', 'Second', 2, 'rejected')
         RETURNING id`,
        [workspace.rows[0]?.id, run.rows[0]?.id],
      );

      await client.query(
        await readFile(path.join(migrationsDirectory, "009_review_revisions_and_final_posts.sql"), "utf8"),
      );

      const migratedRun = await client.query(
        `SELECT id, review_thread_id, review_revision, supersedes_run_id
         FROM workflow_runs WHERE id = $1`,
        [run.rows[0]?.id],
      );
      expect(migratedRun.rows[0]).toMatchObject({
        review_thread_id: run.rows[0]?.id,
        review_revision: 1,
        supersedes_run_id: null,
      });
      const artifacts = await client.query(
        `SELECT id, logical_id, parent_revision_id, version, status
         FROM artifacts ORDER BY version`,
      );
      expect(artifacts.rows).toEqual([
        expect.objectContaining({
          id: first.rows[0]?.id,
          parent_revision_id: null,
          version: 1,
          status: "approved",
        }),
        expect.objectContaining({
          id: second.rows[0]?.id,
          parent_revision_id: first.rows[0]?.id,
          version: 2,
          status: "rejected",
        }),
      ]);
      expect(artifacts.rows[1]?.logical_id).toBe(artifacts.rows[0]?.logical_id);
      expect((await client.query("SELECT count(*)::integer AS count FROM final_posts")).rows[0])
        .toEqual({ count: 0 });
    } finally {
      await client.query("RESET search_path");
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  }, 30_000);
});
