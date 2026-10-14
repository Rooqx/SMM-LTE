import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const hyperdriveId = config.hyperdrive?.find((entry) => entry.binding === "HYPERDRIVE")?.id;
if (!hyperdriveId || hyperdriveId === "REPLACE_WITH_HYPERDRIVE_ID") {
  console.error("Set the real HYPERDRIVE id in client/wrangler.jsonc before deployment.");
  process.exitCode = 1;
}
