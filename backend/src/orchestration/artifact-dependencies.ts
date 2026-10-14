/**
 * Approved artifact inputs that are mandatory for a deterministic recipe step.
 *
 * These dependencies are application workflow rules, not model choices. The
 * backend loads them before the first model call so the model never asks a user
 * to paste content the workspace already owns and never spends a model call
 * discovering a known prerequisite.
 */
const STEP_ARTIFACT_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  "write-platform-posts": ["hook-batch"],
  "score-posts": [
    "post-draft",
    "caption-draft",
    "carousel-draft",
    "thread-draft",
    "video-script",
  ],
  "edit-copy": [
    "post-draft",
    "caption-draft",
    "carousel-draft",
    "thread-draft",
    "video-script",
    "post-scorecard",
  ],
  "format-posts": [
    "post-draft", "caption-draft", "carousel-draft", "thread-draft", "video-script",
    "edited-post-batch",
  ],
  "repurpose-batch": ["final-post-batch"],
  "analyze-performance": ["final-post-batch"],
};

export function approvedArtifactDependenciesForStep(
  stepKey: string,
): readonly string[] {
  return STEP_ARTIFACT_DEPENDENCIES[stepKey] ?? [];
}
