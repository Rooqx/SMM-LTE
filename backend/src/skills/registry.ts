import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { notFound } from "../domain/errors.js";
import type { PhaseNumber } from "../domain/workflow.js";
import { isPhaseNumber } from "../domain/workflow.js";

export type SkillDefinition = {
  name: string;
  description: string;
  phase: PhaseNumber;
  relativePath: string;
  absolutePath: string;
  content: string;
  contentHash: string;
  metadata: Record<string, unknown>;
};

export type SkillAuditIssue = {
  path: string;
  severity: "error" | "warning" | "info";
  message: string;
};

export type SkillBundle = {
  version: string;
  orchestratorHash: string;
  bridgeHash: string;
  orchestratorContent: string;
  bridgeContent: string;
  manifest: Record<string, unknown>;
  skills: readonly SkillDefinition[];
};

type ParsedFrontmatter = {
  attributes: Record<string, unknown>;
  body: string;
};

function parseFrontmatter(content: string, source: string): ParsedFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match?.[1]) {
    throw new Error(`${source}: missing or malformed YAML frontmatter`);
  }

  const attributes = YAML.parse(match[1]);
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    throw new Error(`${source}: frontmatter must be a YAML object`);
  }

  return { attributes: attributes as Record<string, unknown>, body: match[2] ?? "" };
}

function phaseFromRelativePath(relativePath: string): PhaseNumber {
  const firstSegment = relativePath.split(path.sep)[0] ?? "";
  const match = /^(\d{2})-/.exec(firstSegment);
  const phase = Number(match?.[1]);
  if (!isPhaseNumber(phase)) {
    throw new Error(`${relativePath}: skill is not inside a numbered phase directory`);
  }
  return phase;
}

async function findSkillFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
      .map(async (entry) => {
        const candidate = path.join(directory, entry.name);
        if (entry.isDirectory()) return findSkillFiles(candidate);
        return entry.isFile() && entry.name === "SKILL.md" ? [candidate] : [];
      }),
  );
  return nested.flat().sort();
}

export class SkillRegistry {
  readonly #root: string;
  #skillsByName = new Map<string, SkillDefinition>();
  #bundle: SkillBundle | null = null;

  constructor(root: string) {
    this.#root = root;
  }

  async load(): Promise<void> {
    const files = await findSkillFiles(this.#root);
    const next = new Map<string, SkillDefinition>();

    for (const absolutePath of files) {
      const relativePath = path.relative(this.#root, absolutePath);
      const content = await readFile(absolutePath, "utf8");
      const parsed = parseFrontmatter(content, relativePath);
      const name = parsed.attributes.name;
      const description = parsed.attributes.description;

      if (typeof name !== "string" || !/^[a-z0-9-]{1,64}$/.test(name)) {
        throw new Error(`${relativePath}: invalid or missing skill name`);
      }
      if (typeof description !== "string" || description.trim().length === 0) {
        throw new Error(`${relativePath}: invalid or missing skill description`);
      }
      if (next.has(name)) {
        throw new Error(`${relativePath}: duplicate skill name '${name}'`);
      }

      next.set(name, {
        name,
        description: description.trim(),
        phase: phaseFromRelativePath(relativePath),
        relativePath,
        absolutePath,
        content,
        contentHash: createHash("sha256").update(content).digest("hex"),
        metadata:
          parsed.attributes.metadata && typeof parsed.attributes.metadata === "object"
            ? (parsed.attributes.metadata as Record<string, unknown>)
            : {},
      });
    }

    if (next.size === 0) throw new Error(`No SKILL.md files found beneath ${this.#root}`);
    this.#skillsByName = next;
    const [orchestrator, bridge] = await Promise.all([
      readFile(path.join(this.#root, "ORCHESTRATOR.md"), "utf8"),
      readFile(path.join(this.#root, "BRIDGE_CONFIG.md"), "utf8"),
    ]);
    const orchestratorHash = createHash("sha256").update(orchestrator).digest("hex");
    const bridgeHash = createHash("sha256").update(bridge).digest("hex");
    const skills = [...next.values()].sort((left, right) => left.name.localeCompare(right.name));
    const manifest = {
      schemaVersion: 1,
      orchestratorHash,
      bridgeHash,
      skills: skills.map((skill) => ({
        name: skill.name,
        phase: skill.phase,
        relativePath: skill.relativePath,
        contentHash: skill.contentHash,
        metadataVersion: skill.metadata.version ?? null,
      })),
    };
    this.#bundle = {
      version: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
      orchestratorHash,
      bridgeHash,
      orchestratorContent: orchestrator,
      bridgeContent: bridge,
      manifest,
      skills,
    };
  }

  list(): SkillDefinition[] {
    return [...this.#skillsByName.values()].sort(
      (left, right) => left.phase - right.phase || left.name.localeCompare(right.name),
    );
  }

  get(name: string): SkillDefinition {
    const skill = this.#skillsByName.get(name);
    if (!skill) throw notFound("Skill");
    return skill;
  }

  bundle(): SkillBundle {
    if (!this.#bundle) throw new Error("Skill registry has not been loaded");
    return this.#bundle;
  }

  audit(): SkillAuditIssue[] {
    const issues: SkillAuditIssue[] = [];
    for (const skill of this.list()) {
      const legacyReferences = [
        [/(^|[^/.])about-me\.md/, "legacy about-me.md reference"],
        [/(^|[^/.])voice\.md/, "legacy root voice.md reference"],
        [/\.agents\/product-marketing\.md/, "legacy product-marketing.md reference"],
        [/AskUserQuestion/, "host-specific AskUserQuestion reference"],
      ] as const;

      for (const [pattern, message] of legacyReferences) {
        if (pattern.test(skill.content)) {
          // The hosted prompt compiler supplies canonical aliases/tool fallbacks for these
          // legacy instructions. Keep them visible without presenting handled compatibility
          // references as actionable validation failures.
          issues.push({ path: skill.relativePath, severity: "info", message });
        }
      }
    }
    return issues;
  }
}
