import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const ignoredDirectories = new Set([
  ".git", ".codex", ".pnpm-store", ".astro", "node_modules", "dist", "coverage",
]);
const ignoredFiles = new Set(["pnpm-lock.yaml", ".env.example"]);
const patterns = [
  { name: "OpenAI-style API key", expression: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Private key material", expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "GitHub token", expression: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g },
  { name: "AWS access key", expression: /\bAKIA[0-9A-Z]{16}\b/g },
];
const findings = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(absolute);
      continue;
    }
    if (!entry.isFile() || ignoredFiles.has(entry.name) || entry.name.startsWith(".env")) continue;
    const content = await readFile(absolute, "utf8").catch(() => null);
    if (content === null || content.includes("\u0000")) continue;
    for (const pattern of patterns) {
      pattern.expression.lastIndex = 0;
      if (pattern.expression.test(content)) {
        findings.push({ file: path.relative(root, absolute), type: pattern.name });
      }
    }
  }
}

await visit(root);
if (findings.length > 0) {
  console.error(JSON.stringify({ error: "Potential committed secrets found", findings }, null, 2));
  process.exitCode = 1;
} else {
  console.log("No known secret patterns found in source-controlled project files.");
}
