import type pg from "pg";

export const EXPECTED_MIGRATION = "017_question_selection_mode.sql";

/** Readiness is false until the release's additive schema is installed. */
export async function assertExpectedMigration(pool: pg.Pool): Promise<void> {
  const result = await pool.query(
    "SELECT 1 FROM schema_migrations WHERE version = $1 AND checksum IS NOT NULL",
    [EXPECTED_MIGRATION],
  );
  if (!result.rowCount) {
    throw new Error(`Database migration ${EXPECTED_MIGRATION} has not been applied`);
  }
}
