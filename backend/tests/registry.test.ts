import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../src/skills/registry.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("skill registry", () => {
  it("loads every uniquely named phase skill", async () => {
    const registry = new SkillRegistry(repositoryRoot);
    await registry.load();
    const skills = registry.list();
    expect(skills).toHaveLength(44);
    expect(new Set(skills.map((skill) => skill.name)).size).toBe(44);
    expect(skills.every((skill) => skill.phase >= 1 && skill.phase <= 6)).toBe(true);
    const bundle = registry.bundle();
    expect(bundle.version).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.skills).toHaveLength(44);
    expect(bundle.orchestratorHash).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.bridgeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns stable audit results across repeated calls", async () => {
    const registry = new SkillRegistry(repositoryRoot);
    await registry.load();
    expect(registry.audit()).toEqual(registry.audit());
  });
});
