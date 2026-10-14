import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { createPool } from "./pool.js";

const migrationsDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export async function migrate(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);
  const client = await pool.connect();
  let lockHeld = false;

  try {
    await client.query("SELECT pg_advisory_lock(hashtext('smm-orchestrator-migrations'))");
    lockHeld = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text");

    const files = (await readdir(migrationsDirectory))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();

    for (const file of files) {
      const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        "SELECT checksum FROM schema_migrations WHERE version = $1",
        [file],
      );
      if (existing.rows[0]) {
        const recorded = existing.rows[0].checksum as string | null;
        if (recorded && recorded !== checksum) {
          throw new Error(`Migration ${file} changed after it was applied`);
        }
        if (!recorded) {
          await client.query(
            "UPDATE schema_migrations SET checksum = $2 WHERE version = $1",
            [file, checksum],
          );
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    if (lockHeld) {
      await client.query("SELECT pg_advisory_unlock(hashtext('smm-orchestrator-migrations'))");
    }
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
