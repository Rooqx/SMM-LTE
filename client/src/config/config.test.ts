import { describe, expect, it } from "vitest";
import { PRIMARY_NAV_ITEMS } from "./navigation";
import { getPhaseConfig, PHASES_CONFIG } from "./phases";
import { PRODUCT_CONFIG } from "./product";
import { SEO_CONFIG } from "./seo";
import { UI_COPY } from "./ui-copy";

describe("Central Configuration Modules", () => {
  it("defines product identity without hardcoded legacy strings", () => {
    expect(PRODUCT_CONFIG.name).toBe("Rasm");
    expect(PRODUCT_CONFIG.shortName).toBe("Rasm");
    expect(PRODUCT_CONFIG.tagline).toBeTruthy();
    expect(PRODUCT_CONFIG.name).not.toContain("Signal Studio");
  });

  it("configures the four primary navigation destinations", () => {
    expect(PRIMARY_NAV_ITEMS).toHaveLength(4);
    const keys = PRIMARY_NAV_ITEMS.map((item) => item.key);
    expect(keys).toEqual(["today", "library", "brand", "you"]);
    const hrefs = PRIMARY_NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toEqual(["/", "/library", "/brand", "/you"]);
  });

  it("configures all six phases with correct friendly labels", () => {
    expect(Object.keys(PHASES_CONFIG)).toHaveLength(6);
    expect(getPhaseConfig(1).label).toBe("Know your brand");
    expect(getPhaseConfig(1).supportingLabel).toBe("Onboarding");
    expect(getPhaseConfig(2).label).toBe("Plan the month");
    expect(getPhaseConfig(2).supportingLabel).toBe("Strategy");
    expect(getPhaseConfig(3).label).toBe("Create posts");
    expect(getPhaseConfig(3).supportingLabel).toBe("Production");
    expect(getPhaseConfig(4).label).toBe("Polish quality");
    expect(getPhaseConfig(4).supportingLabel).toBe("Review");
    expect(getPhaseConfig(5).label).toBe("Multiply reach");
    expect(getPhaseConfig(5).supportingLabel).toBe("Repurpose");
    expect(getPhaseConfig(6).label).toBe("Learn & improve");
    expect(getPhaseConfig(6).supportingLabel).toBe("Analytics");
  });

  it("falls back gracefully for unknown phase numbers", () => {
    const unknown = getPhaseConfig(99);
    expect(unknown.number).toBe(99);
    expect(unknown.label).toBe("Phase 99");
  });

  it("provides strict robots directives for SEO", () => {
    expect(SEO_CONFIG.robots.authenticated).toBe("noindex, nofollow");
    expect(SEO_CONFIG.robots.public).toBe("index, follow");
    expect(SEO_CONFIG.titleTemplate("Today")).toContain("Rasm");
  });

  it("centralizes UI copy for auth and shell", () => {
    expect(UI_COPY.auth.signInAction).toBeTruthy();
    expect(UI_COPY.shell.notificationsUnavailable).toBeTruthy();
    expect(UI_COPY.shell.signOutAction).toBeTruthy();
  });
});
