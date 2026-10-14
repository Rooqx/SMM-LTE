import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildContainer, type Container } from "../src/container.js";
import { migrate } from "../src/db/migrate.js";
import {
  PHASE_RECIPES,
  RecipeRegistry,
  SKILL_CLASSIFICATIONS,
} from "../src/orchestration/recipes/catalog.js";
import { executeClaimedRun } from "./helpers/jobs.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const integration = describe.skipIf(!databaseUrl);

integration("immutable recipe and skill releases", () => {
  let container: Container;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL = "false";
    process.env.NODE_ENV = "test";
    await migrate();
    const config = loadConfig({
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "false",
      SKILLS_ROOT: repositoryRoot,
      NODE_ENV: "test",
      LLM_PROVIDER: "mock",
      LOG_LEVEL: "silent",
    });
    container = await buildContainer({ config });
    await container.pool.query("TRUNCATE organizations CASCADE");
  }, 30_000);

  afterAll(async () => {
    if (container) {
      await container.pool.query(
        `DELETE FROM job_queue
         WHERE type = 'execute_workflow_run'
           AND payload->>'runId' IN (SELECT id::text FROM workflow_runs)`,
      );
      await container.pool.query("TRUNCATE organizations CASCADE");
    }
    await container?.pool.end();
  });

  it("registers the complete immutable release and pins exact enqueue inputs", async () => {
    const releases = await container.pool.query(
      `SELECT
         (SELECT count(*) FROM recipe_versions)::integer AS recipes,
         (SELECT count(*) FROM skill_bundle_entries)::integer AS skills`,
    );
    expect(releases.rows[0]).toEqual({ recipes: 6, skills: 44 });

    const organization = await container.pool.query(
      "INSERT INTO organizations(name, slug) VALUES ('Release Org', 'release-org') RETURNING id",
    );
    const organizationId = String(organization.rows[0]?.id);
    const workspace = await container.store.createWorkspace({
      organizationId,
      name: "Release Brand",
      slug: "release-brand",
      timezone: "UTC",
      actor: "test:release",
    });
    const firstContext = await container.store.upsertContext(workspace.id, organizationId, {
      key: "brand.voice",
      markdown: "Pinned original voice",
      data: {},
      source: "test",
      actor: "test:release",
    });
    const run = await container.orchestration.enqueueNext({
      organizationId,
      actor: "user:test-owner",
      workspaceId: workspace.id,
      idempotencyKey: "release-pin-1",
    });
    expect(run).toMatchObject({
      skill_name: "social-media-context-sms",
      complete_phase: false,
      recipe_suite_id: "smm-autopilot",
      recipe_id: "phase-1-onboarding",
      recipe_version: "1.0.0",
      skill_content_hash: container.registry.get("social-media-context-sms").contentHash,
      skill_bundle_version: container.registry.bundle().version,
    });
    await expect(container.releases.assertAvailable(
      container.registry.bundle(),
      container.recipes,
    )).resolves.toBeUndefined();
    await container.store.upsertContext(workspace.id, organizationId, {
      key: "brand.voice",
      markdown: "Newer voice that must not change the queued run",
      data: {},
      source: "test",
      actor: "test:release",
    });
    expect(await container.store.listPinnedContextForRun(run.id)).toEqual([
      expect.objectContaining({
        key: "brand.voice",
        markdown: "Pinned original voice",
        version: 1,
      }),
    ]);
    const pins = await container.pool.query(
      "SELECT revision_id FROM workflow_run_context_revisions WHERE run_id = $1",
      [run.id],
    );
    expect(String(pins.rows[0]?.revision_id)).toBe(firstContext.revision_id);

    const execution = await container.releases.getExecutionInputs(
      run.skill_bundle_version!,
      run.skill_name,
      run.skill_content_hash!,
    );
    expect(execution?.skill.contentHash).toBe(run.skill_content_hash);
    expect(await container.releases.hasLiveReferences(run.skill_bundle_version!)).toBe(true);
  });

  it("rejects unsupported skills before creating a run", async () => {
    const organization = await container.pool.query(
      "INSERT INTO organizations(name, slug) VALUES ('Unsupported Org', 'unsupported-org') RETURNING id",
    );
    const organizationId = String(organization.rows[0]?.id);
    const workspace = await container.store.createWorkspace({
      organizationId,
      name: "Unsupported Brand",
      slug: "unsupported-brand",
      timezone: "UTC",
      actor: "test:release",
    });
    // Move only the compatibility phase marker to phase 3 for this boundary test.
    await container.pool.query("UPDATE workspaces SET current_phase = 3 WHERE id = $1", [workspace.id]);
    await expect(container.orchestration.enqueue({
      organizationId,
      actor: "api-key:test",
      workspaceId: workspace.id,
      skillName: "video",
      payload: {},
      completePhase: false,
      idempotencyKey: "unsupported-1",
    })).rejects.toMatchObject({ code: "skill_not_executable" });
    expect((await container.pool.query(
      "SELECT count(*)::integer AS count FROM workflow_runs WHERE workspace_id = $1",
      [workspace.id],
    )).rows[0]?.count).toBe(0);
  });

  it("retains old recipe definitions alongside the current release", async () => {
    const previous = new RecipeRegistry(
      PHASE_RECIPES.map((recipe) => ({ ...recipe, version: "0.9.0" })),
      SKILL_CLASSIFICATIONS,
    );
    previous.validate(container.registry);
    const currentBundle = container.registry.bundle();
    const legacyOrchestrator = `${currentBundle.orchestratorContent}\n<!-- release 0.9 test -->\n`;
    const legacyOrchestratorHash = createHash("sha256")
      .update(legacyOrchestrator)
      .digest("hex");
    const legacyManifest = {
      ...currentBundle.manifest,
      orchestratorHash: legacyOrchestratorHash,
    };
    const legacyBundle = {
      ...currentBundle,
      orchestratorContent: legacyOrchestrator,
      orchestratorHash: legacyOrchestratorHash,
      manifest: legacyManifest,
      version: createHash("sha256").update(JSON.stringify(legacyManifest)).digest("hex"),
    };
    await container.releases.register(legacyBundle, previous);
    const versions = await container.pool.query(
      `SELECT suite_version, count(*)::integer AS phases
       FROM recipe_versions
       GROUP BY suite_version
       ORDER BY suite_version`,
    );
    expect(versions.rows).toEqual([
      { suite_version: "0.9.0", phases: 6 },
      { suite_version: "1.0.0", phases: 6 },
    ]);
    expect(previous.nextMandatoryStep(1, new Set())?.skill).toBe("social-media-context-sms");
    expect(container.recipes.nextMandatoryStep(1, new Set())?.skill)
      .toBe("social-media-context-sms");
    expect(await container.releases.getRecipeForPhase(
      previous.get(1).suiteId,
      previous.get(1).version,
      1,
    )).toMatchObject({ version: "0.9.0", phase: 1 });

    const organization = await container.pool.query(
      "INSERT INTO organizations(name, slug) VALUES ('Legacy Org', 'legacy-release-org') RETURNING id",
    );
    const organizationId = String(organization.rows[0]?.id);
    const workspace = await container.store.createWorkspace({
      organizationId,
      name: "Legacy Brand",
      slug: "legacy-release-brand",
      timezone: "UTC",
      actor: "test:legacy-release",
    });
    const skill = container.registry.get("social-media-context-sms");
    const oldRun = await container.store.enqueueRun({
      organizationId,
      actor: "system:release-test",
      workspaceId: workspace.id,
      expectedPhase: 1,
      skillName: skill.name,
      completePhase: false,
      payload: {},
      idempotencyKey: "legacy-release-run",
      maxAttempts: 3,
      correlationId: "release-test:legacy-release-run",
      admission: {
        maxActiveJobs: container.config.QUEUE_MAX_ACTIVE_JOBS,
        maxActiveJobsPerOrganization: container.config.QUEUE_MAX_ACTIVE_JOBS_PER_ORGANIZATION,
        maxOrganizationTokensPerDay: container.config.MAX_ORGANIZATION_MODEL_TOKENS_PER_DAY,
        maxTokensPerRun: container.config.MAX_MODEL_TOKENS_PER_RUN,
        maxOrganizationCostMicrousdPerDay:
          container.config.MAX_ORGANIZATION_ESTIMATED_COST_MICRO_USD_PER_DAY,
        maxEstimatedCostMicrousdPerRun: 0,
      },
      release: {
        recipeSuiteId: previous.get(1).suiteId,
        recipeId: previous.get(1).id,
        recipeVersion: previous.get(1).version,
        skillBundleVersion: legacyBundle.version,
        skillContentHash: skill.contentHash,
        orchestratorHash: legacyBundle.orchestratorHash,
        bridgeHash: legacyBundle.bridgeHash,
      },
    });
    await executeClaimedRun(container, oldRun.id);
    const oldInputs = await container.releases.getExecutionInputs(
      legacyBundle.version,
      skill.name,
      skill.contentHash,
    );
    expect(oldInputs?.orchestrator).toBe(legacyOrchestrator);
    expect((await container.store.getRun(oldRun.id, organizationId))?.status).toBe("completed");

    const resumedWorkspace = await container.store.createWorkspace({
      organizationId,
      name: "Legacy Resume Brand",
      slug: "legacy-resume-brand",
      timezone: "UTC",
      actor: "test:legacy-release",
    });
    await container.pool.query(
      `UPDATE workflow_instances
       SET recipe_version = '0.9.0'
       WHERE workspace_id = $1`,
      [resumedWorkspace.id],
    );
    await container.pool.query(
      `UPDATE phase_instances
       SET recipe_version = '0.9.0'
       WHERE workspace_id = $1 AND status = 'active'`,
      [resumedWorkspace.id],
    );
    const resumedRun = await container.orchestration.enqueueNext({
      organizationId,
      actor: "user:test-owner",
      workspaceId: resumedWorkspace.id,
      idempotencyKey: "legacy-resume-run",
    });
    expect(resumedRun).toMatchObject({
      recipe_version: "0.9.0",
      recipe_id: previous.get(1).id,
      skill_name: "social-media-context-sms",
    });
  });
});
