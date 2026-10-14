import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { isPhaseNumber } from "../domain/workflow.js";
import { createPool } from "../db/pool.js";
import { Store } from "../db/store.js";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry) => {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(candidate);
      return entry.isFile() && entry.name.endsWith(".md") ? [candidate] : [];
    }),
  );
  return results.flat().sort();
}

const workspaceId = argument("--workspace-id");
if (!workspaceId) {
  throw new Error(
    "Usage: pnpm run import:legacy -- --workspace-id <uuid> [--import-state]",
  );
}
const importState = process.argv.includes("--import-state");

const config = loadConfig();
const pool = createPool(config);
const store = new Store(pool);
const workspaceResult = await pool.query(
  "SELECT organization_id FROM workspaces WHERE id = $1",
  [workspaceId],
);
const organizationId = workspaceResult.rows[0]?.organization_id as string | undefined;
if (!organizationId) throw new Error(`Workspace ${workspaceId} does not exist`);

const contextFiles: Record<string, string> = {
  "brand.voice": ".agents/brand/voice.md",
  "brand.audience": ".agents/brand/audience.md",
  "brand.positioning": ".agents/brand/positioning.md",
  "brand.profile_funnels": ".agents/brand/profile-funnels.md",
  "social.context": ".agents/social-media-context-sms.md",
  "strategy.content_matrix": ".agents/strategy/content-matrix.md",
  "strategy.campaign_backlog": ".agents/strategy/campaign-backlog.md",
  "strategy.platform_cadence": ".agents/strategy/platform-cadence.md",
  "calendar.current_sprint": ".agents/calendar/current-sprint.md",
};

try {
  for (const [key, relativePath] of Object.entries(contextFiles)) {
    const markdown = await readFile(path.join(config.SKILLS_ROOT, relativePath), "utf8").catch(
      () => null,
    );
    if (markdown === null) continue;
    await store.upsertContext(workspaceId, organizationId, {
      key,
      markdown,
      data: {},
      source: "legacy-import",
      actor: "cli:legacy-import",
    });
    console.log(`Imported ${relativePath} as ${key}`);
  }

  const statePath = path.join(config.SKILLS_ROOT, ".agents/state.json");
  const stateText = await readFile(statePath, "utf8").catch(() => null);
  if (stateText && importState) {
    const state = JSON.parse(stateText) as { current_phase?: number };
    if (typeof state.current_phase === "number" && isPhaseNumber(state.current_phase)) {
      await pool.query(
        `UPDATE workspaces SET current_phase = $2, status = 'ready', version = version + 1,
           updated_at = now() WHERE id = $1`,
        [workspaceId, state.current_phase],
      );
      console.log(`Imported workflow phase ${state.current_phase}`);
    }
  }

  const draftsRoot = path.join(config.SKILLS_ROOT, ".agents/drafts");
  const drafts = await markdownFiles(draftsRoot).catch(() => []);
  for (const file of drafts) {
    const content = await readFile(file, "utf8");
    const relative = path.relative(draftsRoot, file);
    const parsed = path.parse(relative);
    await pool.query(
      `INSERT INTO artifacts(workspace_id, kind, slug, title, content, metadata, version, status)
       VALUES ($1, 'legacy-draft', $2, $3, $4, $5, 1, 'approved')
       ON CONFLICT (workspace_id, kind, slug, version) DO NOTHING`,
      [
        workspaceId,
        relative.replace(/\.md$/i, "").replace(/[^a-zA-Z0-9._/-]+/g, "-"),
        parsed.name,
        content,
        { sourcePath: path.relative(config.SKILLS_ROOT, file) },
      ],
    );
    console.log(`Imported draft ${relative}`);
  }
} finally {
  await pool.end();
}
