import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PHASE_RECIPES,
  RecipeRegistry,
  SKILL_CLASSIFICATIONS,
} from "../src/orchestration/recipes/catalog.js";
import { SkillRegistry } from "../src/skills/registry.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("typed phase recipes", () => {
  it("validates all six recipes and classifies every discovered skill exactly once", async () => {
    const skills = new SkillRegistry(repositoryRoot);
    await skills.load();
    const recipes = new RecipeRegistry();
    expect(() => recipes.validate(skills)).not.toThrow();
    expect(PHASE_RECIPES.map((recipe) => recipe.phase)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(SKILL_CLASSIFICATIONS).toHaveLength(44);
    expect(new Set(SKILL_CLASSIFICATIONS.map((item) => item.skill)).size).toBe(44);
  });

  it("selects mandatory steps deterministically and bounds optional requests", () => {
    const recipes = new RecipeRegistry();
    expect(recipes.nextMandatoryStep(2, new Set())?.key).toBe("define-content-strategy");
    expect(recipes.nextMandatoryStep(2, new Set(["define-content-strategy"]))?.key)
      .toBe("define-platform-strategy");
    expect(recipes.optionalSkillForStep(3, "write-platform-posts", "carousel-writer-sms"))
      .toBe("carousel-writer-sms");
    expect(() => recipes.optionalSkillForStep(3, "write-platform-posts", "analytics"))
      .toThrow(/not optional/);
  });

  it("fails closed when a discovered skill is missing a classification", async () => {
    const skills = new SkillRegistry(repositoryRoot);
    await skills.load();
    const incomplete = new RecipeRegistry(PHASE_RECIPES, SKILL_CLASSIFICATIONS.slice(1));
    expect(() => incomplete.validate(skills)).toThrow(/not classified/);
  });

  it("can retain an older source-controlled recipe implementation beside current", async () => {
    const skills = new SkillRegistry(repositoryRoot);
    await skills.load();
    const previous = new RecipeRegistry(
      PHASE_RECIPES.map((recipe) => ({ ...recipe, version: "0.9.0" })),
      SKILL_CLASSIFICATIONS,
    );
    expect(() => previous.validate(skills)).not.toThrow();
    expect(previous.get(6).version).toBe("0.9.0");
    expect(new RecipeRegistry().get(6).version).toBe("1.0.0");
  });
});
