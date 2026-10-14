import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "../dist/db/migrate.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(backendRoot, "..");
const environment = { ...process.env, SKILLS_ROOT: repositoryRoot };
const children = new Map();
let stopping = false;
let exitCode = 0;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

try {
  // Render Free has no pre-deploy command. The advisory lock in migrate() keeps
  // this safe if a replacement instance starts while the previous one exists.
  await migrate();
  if (stopping) {
    process.exitCode = 0;
    process.exit();
  }
  for (const [name, entry] of [
    ["api", "dist/index.js"],
    ["worker", "dist/worker-entry.js"],
  ]) {
    const child = spawn(process.execPath, [path.join(backendRoot, entry)], {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
    });
    children.set(name, child);
    child.once("error", (error) => {
      console.error(`${name} failed to start`, error);
      exitCode = 1;
      stop();
    });
    child.once("exit", (code, signal) => {
      children.delete(name);
      if (!stopping) {
        console.error(`${name} exited unexpectedly`, { code, signal });
        exitCode = 1;
        stop();
      }
    });
  }
  await Promise.all([...children.values()].map((child) =>
    new Promise((resolve) => child.once("close", resolve))));
} catch (error) {
  console.error("Render service failed to start", error);
  exitCode = 1;
  stop();
}

process.exitCode = exitCode;
