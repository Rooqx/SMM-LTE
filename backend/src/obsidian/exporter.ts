import { randomUUID } from "node:crypto";
import { mkdir, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Store } from "../db/store.js";
import { notFound } from "../domain/errors.js";

export class PermanentExportError extends Error {
  override readonly name = "PermanentExportError";
}

function safeSegment(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  if (!normalized || normalized === "." || normalized === "..") {
    throw new PermanentExportError("Value cannot be converted to a safe vault path segment");
  }
  return normalized;
}

function assertWithinRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PermanentExportError("Resolved Obsidian export path escapes the configured root");
  }
}

async function atomicWrite(root: string, filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const resolvedParent = await realpath(path.dirname(filePath));
  assertWithinRoot(root, resolvedParent);
  const temporary = path.join(resolvedParent, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, filePath);
}

function frontmatter(values: Record<string, string | number>): string {
  const lines = Object.entries(values).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

export class ObsidianExporter {
  constructor(
    readonly root: string,
    readonly store: Store,
    readonly maxFiles = 5_000,
    readonly maxBytes = 50_000_000,
  ) {}

  async exportWorkspace(
    workspaceId: string,
    organizationId: string,
  ): Promise<{ directory: string; files: string[] }> {
    const workspace = await this.store.getWorkspace(workspaceId, organizationId);
    if (!workspace) throw notFound("Workspace");
    const context = await this.store.listContext(workspaceId, organizationId);
    const artifacts = await this.store.listApprovedArtifacts(workspaceId, organizationId);
    const fileCount = 1 + context.length + artifacts.length;
    if (fileCount > this.maxFiles) {
      throw new PermanentExportError(`Obsidian export exceeds the ${this.maxFiles}-file limit`);
    }
    const contentBytes = context.reduce(
      (total, entry) => total + Buffer.byteLength(entry.markdown, "utf8"),
      0,
    ) + artifacts.reduce(
      (total, artifact) => total + Buffer.byteLength(artifact.content, "utf8"),
      0,
    );
    if (contentBytes > this.maxBytes) {
      throw new PermanentExportError(`Obsidian export exceeds the ${this.maxBytes}-byte limit`);
    }
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const exportRoot = await realpath(this.root);
    const workspaceDirectory = path.resolve(exportRoot, safeSegment(workspace.slug));
    assertWithinRoot(exportRoot, workspaceDirectory);
    await mkdir(workspaceDirectory, { recursive: true, mode: 0o700 });
    assertWithinRoot(exportRoot, await realpath(workspaceDirectory));

    const files: string[] = [];
    const homePath = path.join(workspaceDirectory, "Home.md");
    await atomicWrite(
      exportRoot,
      homePath,
      `${frontmatter({ workspace_id: workspace.id, phase: workspace.current_phase })}# ${workspace.name}\n\n` +
        `Current phase: ${workspace.current_phase}\n\n` +
        `## Context\n${context.map((entry) => `- [[Context/${safeSegment(entry.key)}]]`).join("\n")}\n\n` +
        `## Artifacts\n${artifacts.map((entry) => `- [[Artifacts/${safeSegment(entry.kind)}/${safeSegment(entry.slug)}-v${entry.version}]]`).join("\n")}\n`,
    );
    files.push(homePath);

    for (const entry of context) {
      const filePath = path.join(workspaceDirectory, "Context", `${safeSegment(entry.key)}.md`);
      await atomicWrite(
        exportRoot,
        filePath,
        `${frontmatter({ key: entry.key, version: entry.version })}${entry.markdown}\n`,
      );
      files.push(filePath);
    }
    for (const artifact of artifacts) {
      const filePath = path.join(
        workspaceDirectory,
        "Artifacts",
        safeSegment(artifact.kind),
        `${safeSegment(artifact.slug)}-v${artifact.version}.md`,
      );
      await atomicWrite(
        exportRoot,
        filePath,
        `${frontmatter({ artifact_id: artifact.id, run_id: artifact.run_id ?? "", version: artifact.version })}` +
          `# ${artifact.title}\n\n${artifact.content}\n`,
      );
      files.push(filePath);
    }
    return {
      directory: path.relative(exportRoot, workspaceDirectory),
      files: files.map((file) => path.relative(exportRoot, file)),
    };
  }
}
