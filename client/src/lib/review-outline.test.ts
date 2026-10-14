import { describe, expect, it } from "vitest";
import { reviewOutline } from "./review-outline";

describe("reviewOutline", () => {
  it("extracts only headings and a paragraph from the supplied draft", () => {
    expect(reviewOutline("# Positioning\n\nWe help founders publish consistently.\n\n## Audience\n\nB2B founders.")).toEqual({
      headings: ["Positioning", "Audience"],
      excerpt: "We help founders publish consistently.",
    });
  });

  it("ignores code fences and never invents an excerpt", () => {
    expect(reviewOutline("```md\n# Not a heading\nSecret text\n```\n\n# Actual\n\n- One\n- Two")).toEqual({
      headings: ["Actual"],
      excerpt: null,
    });
  });
});
