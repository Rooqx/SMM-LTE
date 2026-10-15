import { describe, expect, it, vi } from "vitest";
import {
  copyToClipboard,
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

describe("copyToClipboard", () => {
  it("uses navigator.clipboard.writeText when in secure context", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    const result = await copyToClipboard("Hello world");
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("Hello world");
  });

  it("falls back to document.execCommand when navigator.clipboard is absent", async () => {
    Object.assign(navigator, { clipboard: undefined });
    const execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandMock;

    const result = await copyToClipboard("Fallback text");
    expect(result).toBe(true);
    expect(execCommandMock).toHaveBeenCalledWith("copy");
  });

  it("falls back to document.execCommand when navigator.clipboard.writeText rejects", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Permission denied")) },
    });
    const execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandMock;

    const result = await copyToClipboard("Fallback text on rejection");
    expect(result).toBe(true);
    expect(execCommandMock).toHaveBeenCalledWith("copy");
  });
});

