import { createHash } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import type { RecipeRegistry } from "../orchestration/recipes/catalog.js";
import type { PhaseRecipe } from "../orchestration/recipes/types.js";
import type { SkillBundle, SkillDefinition } from "./registry.js";

const RecipeStepSchema = z.object({
  key: z.string().min(1).max(120),
  ordinal: z.number().int().positive(),
  skill: z.string().min(1).max(120),
  purpose: z.string().min(1),
  requiredContextKeys: z.array(z.string()),
  acceptedIntents: z.array(z.enum(["continue", "answer", "retry"])),
  optionalSkills: z.array(z.string()),
  allowedTools: z.array(z.literal("list_approved_artifacts")),
  allowedContextUpdates: z.array(z.string()),
  allowedArtifactKinds: z.array(z.string()),
  inputContract: z.literal("workspace-input-v1"),
  outputContract: z.literal("skill-execution-v1"),
  repeatable: z.boolean(),
  maxAttempts: z.number().int().min(1).max(20),
  completion: z.string().min(1),
}).strict();

const PhaseRecipeSchema = z.object({
  id: z.string().min(1),
  suiteId: z.string().min(1),
  version: z.string().min(1),
  phase: z.number().int().min(1).max(6),
  purpose: z.string().min(1),
  approvalGate: z.string().nullable(),
  nextPhase: z.number().int().min(1).max(6),
  steps: z.array(RecipeStepSchema).min(1),
}).strict();

/** Persists trusted release inputs; user/workspace prompt data never enters these tables. */
export class SkillReleaseStore {
  constructor(readonly pool: pg.Pool) {}

  /** Fails readiness when API/worker code and persisted release inputs diverge. */
  async assertAvailable(bundle: SkillBundle, recipes: RecipeRegistry): Promise<void> {
    const firstRecipe = recipes.recipes[0];
    if (!firstRecipe) throw new Error("A recipe release cannot be empty");
    const result = await this.pool.query(
      `SELECT
         EXISTS(
           SELECT 1 FROM skill_bundles
           WHERE version = $1 AND orchestrator_hash = $2 AND bridge_hash = $3
         ) AS bundle_matches,
         (SELECT count(*) FROM skill_bundle_entries
          WHERE bundle_version = $1)::integer AS skills,
         (SELECT count(*) FROM recipe_versions
          WHERE suite_id = $4 AND suite_version = $5)::integer AS recipes`,
      [bundle.version, bundle.orchestratorHash, bundle.bridgeHash,
        firstRecipe.suiteId, firstRecipe.version],
    );
    const row = result.rows[0] as
      | { bundle_matches: boolean; skills: number; recipes: number }
      | undefined;
    if (!row?.bundle_matches || Number(row.skills) !== bundle.skills.length ||
        Number(row.recipes) !== recipes.recipes.length) {
      throw new Error("The active recipe/skill release is unavailable or incompatible");
    }
  }

  async register(bundle: SkillBundle, recipes: RecipeRegistry): Promise<void> {
    const digest = (content: string) => createHash("sha256").update(content).digest("hex");
    if (digest(JSON.stringify(bundle.manifest)) !== bundle.version ||
        digest(bundle.orchestratorContent) !== bundle.orchestratorHash ||
        digest(bundle.bridgeContent) !== bundle.bridgeHash ||
        bundle.skills.some((skill) => digest(skill.content) !== skill.contentHash)) {
      throw new Error("Refusing to register a skill bundle with inconsistent hashes");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO skill_bundles(
           version, orchestrator_hash, bridge_hash,
           orchestrator_content, bridge_content, manifest
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (version) DO NOTHING`,
        [bundle.version, bundle.orchestratorHash, bundle.bridgeHash,
          bundle.orchestratorContent, bundle.bridgeContent, bundle.manifest],
      );
      for (const skill of bundle.skills) {
        await client.query(
          `INSERT INTO skill_bundle_entries(
             bundle_version, skill_name, phase, relative_path, content_hash,
             content, description, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (bundle_version, skill_name) DO NOTHING`,
          [bundle.version, skill.name, skill.phase, skill.relativePath, skill.contentHash,
            skill.content, skill.description, skill.metadata],
        );
      }
      for (const recipe of recipes.recipes) {
        await client.query(
          `INSERT INTO recipe_versions(
             suite_id, suite_version, phase, recipe_id, definition_hash, definition
           ) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (suite_id, suite_version, phase) DO NOTHING`,
          [recipe.suiteId, recipe.version, recipe.phase, recipe.id,
            recipes.definitionHashes.get(recipe.phase), recipe],
        );
      }
      // A same-version row with different content is a release-integrity error,
      // not an update. This also catches partial/manual database corruption.
      const counts = await client.query(
        `SELECT
           (SELECT count(*) FROM skill_bundle_entries WHERE bundle_version = $1)::integer AS skills,
           (SELECT count(*) FROM recipe_versions
            WHERE suite_id = $2 AND suite_version = $3)::integer AS recipes`,
        [bundle.version, recipes.recipes[0]?.suiteId, recipes.recipes[0]?.version],
      );
      if (Number(counts.rows[0]?.skills) !== bundle.skills.length ||
          Number(counts.rows[0]?.recipes) !== recipes.recipes.length) {
        throw new Error("The persisted recipe/skill release is incomplete");
      }
      // A pg client executes one statement at a time. Keep these reads sequential
      // so registration stays compatible with pg 9 and transaction ordering is
      // explicit. Parallel queries belong on independently checked-out clients.
      const persistedBundle = await client.query(
        `SELECT orchestrator_hash, bridge_hash FROM skill_bundles WHERE version = $1`,
        [bundle.version],
      );
      const persistedSkills = await client.query(
        `SELECT skill_name, content_hash FROM skill_bundle_entries WHERE bundle_version = $1`,
        [bundle.version],
      );
      const persistedRecipes = await client.query(
        `SELECT phase, definition_hash FROM recipe_versions
         WHERE suite_id = $1 AND suite_version = $2`,
        [recipes.recipes[0]?.suiteId, recipes.recipes[0]?.version],
      );
      const bundleRow = persistedBundle.rows[0] as
        | { orchestrator_hash: string; bridge_hash: string }
        | undefined;
      const skillHashes = new Map(
        persistedSkills.rows.map((row) => [String(row.skill_name), String(row.content_hash)]),
      );
      const recipeHashes = new Map(
        persistedRecipes.rows.map((row) => [Number(row.phase), String(row.definition_hash)]),
      );
      if (!bundleRow || bundleRow.orchestrator_hash !== bundle.orchestratorHash ||
          bundleRow.bridge_hash !== bundle.bridgeHash ||
          bundle.skills.some((skill) => skillHashes.get(skill.name) !== skill.contentHash) ||
          recipes.recipes.some((recipe) =>
            recipeHashes.get(recipe.phase) !== recipes.definitionHashes.get(recipe.phase))) {
        throw new Error("A persisted release conflicts with the source-controlled definition");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getExecutionInputs(
    bundleVersion: string,
    skillName: string,
    expectedHash: string,
  ): Promise<{ skill: SkillDefinition; orchestrator: string; bridge: string } | null> {
    return this.#getBundleSkill(bundleVersion, skillName, expectedHash);
  }

  /** Loads the exact recipe definition pinned when a run was enqueued. */
  async getRecipe(
    suiteId: string,
    suiteVersion: string,
    phase: number,
    recipeId: string,
  ): Promise<PhaseRecipe | null> {
    const result = await this.pool.query(
      `SELECT definition
       FROM recipe_versions
       WHERE suite_id = $1 AND suite_version = $2 AND phase = $3 AND recipe_id = $4`,
      [suiteId, suiteVersion, phase, recipeId],
    );
    const definition = result.rows[0]?.definition as unknown;
    if (!definition) return null;
    const parsed = PhaseRecipeSchema.parse(definition);
    if (parsed.suiteId !== suiteId || parsed.version !== suiteVersion ||
        parsed.phase !== phase || parsed.id !== recipeId) {
      throw new Error("Persisted recipe identity does not match its release key");
    }
    return parsed as PhaseRecipe;
  }

  async getRecipeForPhase(
    suiteId: string,
    suiteVersion: string,
    phase: number,
  ): Promise<PhaseRecipe | null> {
    const result = await this.pool.query(
      `SELECT definition
       FROM recipe_versions
       WHERE suite_id = $1 AND suite_version = $2 AND phase = $3`,
      [suiteId, suiteVersion, phase],
    );
    const definition = result.rows[0]?.definition as unknown;
    if (!definition) return null;
    const parsed = PhaseRecipeSchema.parse(definition);
    if (parsed.suiteId !== suiteId || parsed.version !== suiteVersion || parsed.phase !== phase) {
      throw new Error("Persisted recipe identity does not match its release key");
    }
    return parsed as PhaseRecipe;
  }

  async getBundleSkill(
    bundleVersion: string,
    skillName: string,
  ): Promise<{ skill: SkillDefinition; orchestrator: string; bridge: string } | null> {
    return this.#getBundleSkill(bundleVersion, skillName, null);
  }

  async #getBundleSkill(
    bundleVersion: string,
    skillName: string,
    expectedHash: string | null,
  ): Promise<{ skill: SkillDefinition; orchestrator: string; bridge: string } | null> {
    const result = await this.pool.query(
      `SELECT entry.skill_name, entry.phase, entry.relative_path, entry.content_hash,
              entry.content, entry.description, entry.metadata,
              bundle.orchestrator_content, bundle.bridge_content
       FROM skill_bundle_entries AS entry
       JOIN skill_bundles AS bundle ON bundle.version = entry.bundle_version
       WHERE entry.bundle_version = $1 AND entry.skill_name = $2
         AND ($3::text IS NULL OR entry.content_hash = $3)`,
      [bundleVersion, skillName, expectedHash],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const content = String(row.content);
    const orchestrator = String(row.orchestrator_content);
    const bridge = String(row.bridge_content);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    const persistedHash = String(row.content_hash);
    if (digest(content) !== persistedHash || (expectedHash && persistedHash !== expectedHash)) {
      throw new Error("Persisted skill content failed its integrity check");
    }
    const skill: SkillDefinition = {
      name: String(row.skill_name),
      phase: Number(row.phase) as SkillDefinition["phase"],
      relativePath: String(row.relative_path),
      absolutePath: "",
      contentHash: persistedHash,
      content,
      description: String(row.description),
      metadata: row.metadata as Record<string, unknown>,
    };
    return {
      skill,
      orchestrator,
      bridge,
    };
  }

  async hasLiveReferences(bundleVersion: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM workflow_runs
         WHERE skill_bundle_version = $1
           AND status IN ('queued', 'running', 'waiting_approval', 'failed')
       ) AS referenced`,
      [bundleVersion],
    );
    return Boolean(result.rows[0]?.referenced);
  }
}
