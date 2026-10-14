import { describe, expect, it } from "vitest";
import type { ContextItem } from "@/lib/contracts";
import {
  buildBrandAreas,
  contextItemLabel,
  formatContextDate,
} from "./brand-presenter";

describe("brand presenter", () => {
  it("maps namespaced context into configured human-facing areas", () => {
    const items: ContextItem[] = [
      { key: "brand.voice", markdown: "Warm", version: 2 },
      { key: "brand.audience.primary", markdown: "Founders", version: 1 },
      { key: "brand.about", markdown: "A studio", version: 3 },
      { key: "strategy.monthly_plan", markdown: "Trust", version: 1 },
    ];

    const areas = buildBrandAreas(items);

    expect(areas.map((area) => area.config.key)).toEqual([
      "voice",
      "audience",
      "fundamentals",
      "strategy",
    ]);
    expect(areas[0]?.items[0]?.version).toBe(2);
  });

  it("keeps unmatched context visible in Additional memory", () => {
    const areas = buildBrandAreas([
      { key: "operations.compliance", markdown: "Reviewed", version: 1 },
    ]);

    expect(areas[0]?.config.key).toBe("additional");
    expect(areas[0]?.items[0]?.key).toBe("operations.compliance");
  });

  it("formats key labels without exposing namespace punctuation", () => {
    expect(contextItemLabel("brand.primary_audience-profile")).toBe(
      "Primary Audience Profile",
    );
  });

  it("falls back to UTC when a workspace timezone is invalid", () => {
    expect(formatContextDate("2026-10-09T12:00:00Z", "Invalid/Timezone")).toBeTruthy();
  });
});
