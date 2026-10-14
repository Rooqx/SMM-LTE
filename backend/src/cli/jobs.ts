import { z } from "zod";
import { loadConfig } from "../config.js";
import { JobQueue } from "../db/jobs.js";
import { createPool } from "../db/pool.js";

const command = process.argv[2];
const config = loadConfig();
const pool = createPool(config);
const queue = new JobQueue(
  pool,
  `operator-${process.pid}`,
  config.WORKER_LEASE_SECONDS,
  config.WORKER_MAX_CONCURRENT_JOBS_PER_ORGANIZATION,
);

try {
  if (command === "list-dead") {
    const limit = z.coerce.number().int().min(1).max(100).parse(process.argv[3] ?? 50);
    console.log(JSON.stringify(await queue.listDead(limit), null, 2));
  } else if (command === "retry-dead") {
    const jobId = z.string().uuid().parse(process.argv[3]);
    await queue.retryDead(jobId);
    console.log(JSON.stringify({ jobId, status: "retry_scheduled" }));
  } else {
    throw new Error(
      "Usage: pnpm run jobs -- list-dead [limit] | retry-dead <job-uuid>",
    );
  }
} finally {
  await pool.end();
}
