import { describe, expect, it } from "vitest";
import { approvedArtifactDependenciesForStep } from
  "../src/orchestration/artifact-dependencies.js";

describe("deterministic artifact dependencies", () => {
  it("loads approved drafts for quality scoring", () => {
    expect(approvedArtifactDependenciesForStep("score-posts")).toEqual([
      "post-draft",
      "caption-draft",
      "carousel-draft",
      "thread-draft",
      "video-script",
    ]);
  });

  it("loads the exact upstream output for editing and formatting", () => {
    expect(approvedArtifactDependenciesForStep("edit-copy")).toContain("post-scorecard");
    expect(approvedArtifactDependenciesForStep("format-posts")).toEqual([
      "post-draft", "caption-draft", "carousel-draft", "thread-draft",
      "video-script", "edited-post-batch",
    ]);
  });

  it("returns no implicit dependency for unrelated steps", () => {
    expect(approvedArtifactDependenciesForStep("capture-social-context")).toEqual([]);
  });
});
