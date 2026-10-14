import { describe, expect, it } from "vitest";
import { canonicalizeInterviewOptions } from "../src/db/interview-store.js";
import { getQuestionnaire } from "../src/interview/definitions.js";

describe("interview option canonicalization", () => {
  it("preserves every reviewed fallback field used for provenance and validation", () => {
    const fallbacks = getQuestionnaire(undefined, "1.0.0").questions[0]!.fallbackOptions;
    const canonical = canonicalizeInterviewOptions("curated", fallbacks);
    expect(canonical).toEqual(fallbacks);
    expect(canonical.find((option) => option.id === "something_else"))
      .toMatchObject({ requiresCustomText: true });
  });

  it("assigns bounded canonical ids instead of trusting model identifiers", () => {
    const canonical = canonicalizeInterviewOptions("model", [
      { label: "A specialist consultancy" },
      { label: "A membership community", description: "Recurring member support" },
    ]);
    expect(canonical).toEqual([
      { id: expect.stringMatching(/^suggestion_1_[a-f0-9]{12}$/), label: "A specialist consultancy" },
      {
        id: expect.stringMatching(/^suggestion_2_[a-f0-9]{12}$/),
        label: "A membership community",
        description: "Recurring member support",
      },
    ]);
    expect(() => canonicalizeInterviewOptions("model", [
      { id: "provider-id", label: "First" } as unknown as { label: string },
      { label: "Second" },
    ])).toThrow("unsupported field");
  });

  it("rejects duplicate, marked-up, or whitespace-padded model choices", () => {
    expect(() => canonicalizeInterviewOptions("model", [
      { label: "Same" },
      { label: "same" },
    ])).toThrow("distinct");
    expect(() => canonicalizeInterviewOptions("model", [
      { label: "<b>First</b>" },
      { label: "Second" },
    ])).toThrow("plain text");
    expect(() => canonicalizeInterviewOptions("model", [
      { label: " First" },
      { label: "Second" },
    ])).toThrow("surrounding whitespace");
  });
});
