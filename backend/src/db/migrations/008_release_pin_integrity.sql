-- Keep migration 007 immutable after deployment. This forward-only follow-up
-- makes release pins all-or-nothing and removes transitional columns that were
-- never used by the run-based execution aggregate.

ALTER TABLE workflow_runs
  ADD CONSTRAINT workflow_runs_release_pins_complete_check
    CHECK (
      (recipe_suite_id IS NULL AND recipe_id IS NULL AND recipe_version IS NULL
       AND skill_bundle_version IS NULL AND skill_content_hash IS NULL
       AND orchestrator_hash IS NULL AND bridge_hash IS NULL)
      OR
      (recipe_suite_id IS NOT NULL AND recipe_id IS NOT NULL AND recipe_version IS NOT NULL
       AND skill_bundle_version IS NOT NULL AND skill_content_hash IS NOT NULL
       AND orchestrator_hash IS NOT NULL AND bridge_hash IS NOT NULL)
    );

ALTER TABLE orchestration_steps
  DROP COLUMN recipe_id,
  DROP COLUMN orchestrator_hash,
  DROP COLUMN bridge_hash;
