import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "dotenv";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hyperdriveLocalKey = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";
let localConnectionString = process.env[hyperdriveLocalKey];

if (!localConnectionString) {
  const envFile = await readFile(path.join(clientRoot, ".env"), "utf8").catch(() => "");
  localConnectionString = parse(envFile).DATABASE_URL;
}

if (!localConnectionString) {
  console.error(
    `Local Hyperdrive needs a PostgreSQL URL. Set ${hyperdriveLocalKey} or DATABASE_URL in client/.env.`,
  );
  process.exit(1);
}

const child = spawn(path.join(clientRoot, "node_modules", ".bin", "astro"), [
  "dev",
  "--ignore-lock",
  "--host",
  "0.0.0.0",
  ...process.argv.slice(2),
], {
  cwd: clientRoot,
  env: { ...process.env, [hyperdriveLocalKey]: localConnectionString },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error("Could not start Astro dev server:", error.message);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
