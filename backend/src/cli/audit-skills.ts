import { loadConfig } from "../config.js";
import { SkillRegistry } from "../skills/registry.js";

const config = loadConfig();
const registry = new SkillRegistry(config.SKILLS_ROOT);
await registry.load();

const skills = registry.list();
const issues = registry.audit();
const counts = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].map((phase) => [
    `phase_${phase}`,
    skills.filter((skill) => skill.phase === phase).length,
  ]),
);

console.log(JSON.stringify({ skills: skills.length, counts, issues }, null, 2));
if (issues.some((issue) => issue.severity === "error")) process.exitCode = 1;
