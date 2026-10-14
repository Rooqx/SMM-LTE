import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateOnly,
  markdownFilename,
  safeLocalPath,
} from "./utils";

describe("safeLocalPath", () => {
  it("preserves local paths with query strings and fragments", () => {
    expect(safeLocalPath("/context?workspace=one#editor")).toBe(
      "/context?workspace=one#editor",
    );
  });

  it.each([
    "//attacker.example",
    "/\\attacker.example",
    "https://attacker.example",
    "context",
  ])("rejects unsafe navigation target %s", (value) =>
    expect(safeLocalPath(value)).toBe("/"),
  );
});

describe("markdownFilename", () => {
  it("removes path separators and unsafe filename characters", () => {
    expect(markdownFilename("../../launch / post")).toBe("launch-post.md");
  });
});

describe("timezone-safe date formatting", () => {
  it("formats the same instant in the requested workspace timezone", () => {
    const instant = "2026-10-09T23:30:00Z";
    expect(formatDateOnly(instant, "Africa/Lagos", "en-CA")).toContain(
      "Oct 10, 2026",
    );
    expect(formatDateOnly(instant, "America/New_York", "en-CA")).toContain(
      "Oct 9, 2026",
    );
  });

  it("falls back to deterministic UTC and English for invalid settings", () => {
    expect(
      formatDate("2026-10-09T23:30:00Z", "Not/A-Timezone", "bad-locale"),
    ).toContain("Oct 9, 2026");
  });
});
