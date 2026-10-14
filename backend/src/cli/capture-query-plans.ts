import { loadConfig } from "../config.js";
import { createPool } from "../db/pool.js";

const PLANS = {
  scopedWorkspaceRead: {
    sql: `SELECT * FROM workspaces WHERE id = $1::uuid AND organization_id = $2::uuid`,
    parameters: ["00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000"],
  },
  guidedInterviewResume: {
    sql: `SELECT session.*
          FROM interview_sessions AS session
          JOIN interview_authorities AS authority
            ON authority.workspace_id = session.workspace_id
          JOIN workspaces ON workspaces.id = session.workspace_id
          WHERE session.workspace_id = $1::uuid
            AND workspaces.organization_id = $2::uuid
            AND authority.authority = 'guided'
            AND session.status IN ('in_progress', 'completed')
          ORDER BY CASE session.status WHEN 'in_progress' THEN 0 ELSE 1 END,
                   session.started_at DESC
          LIMIT 1`,
    parameters: ["00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000"],
  },
  pendingQuestionRead: {
    sql: `SELECT question.*
          FROM pending_questions AS question
          JOIN workspaces ON workspaces.id = question.workspace_id
          WHERE question.workspace_id = $1::uuid
            AND workspaces.organization_id = $2::uuid
            AND question.status = 'pending'`,
    parameters: ["00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000"],
  },
} as const;

async function main(): Promise<void> {
  const pool = createPool(loadConfig());
  try {
    const [version, counts] = await Promise.all([
      pool.query("SELECT current_setting('server_version') AS version"),
      pool.query(
        `SELECT
           (SELECT count(*)::integer FROM workspaces) AS workspaces,
           (SELECT count(*)::integer FROM workflow_runs) AS workflow_runs,
           (SELECT count(*)::integer FROM pending_questions) AS pending_questions,
           (SELECT count(*)::integer FROM interview_sessions) AS interview_sessions,
           (SELECT count(*)::integer FROM interview_answers) AS interview_answers,
           (SELECT count(*)::integer FROM job_queue) AS jobs`,
      ),
    ]);
    const plans: Record<string, unknown> = {};
    for (const [name, query] of Object.entries(PLANS)) {
      const explained = await pool.query(
        `EXPLAIN (FORMAT JSON, COSTS TRUE, VERBOSE FALSE) ${query.sql}`,
        [...query.parameters],
      );
      plans[name] = explained.rows[0]?.["QUERY PLAN"] ?? null;
    }
    console.log(JSON.stringify({
      recordedAt: new Date().toISOString(),
      databaseVersion: version.rows[0]?.version,
      datasetShape: counts.rows[0],
      analyzeExecuted: false,
      plans,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
