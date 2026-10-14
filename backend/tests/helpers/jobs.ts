import type { Container } from "../../src/container.js";
import { leaseFor, type ClaimedJob } from "../../src/db/jobs.js";

export async function claimRunJob(container: Container, runId: string): Promise<ClaimedJob> {
  // Some integration suites intentionally retain earlier queued fixtures to
  // inspect their pins. Drain only their queue records while locating the
  // exact run under test; production workers never select by a caller run ID.
  for (let index = 0; index < 100; index += 1) {
    const job = await container.queue.claim(["execute_workflow_run"]);
    if (!job) break;
    if (job.payload.runId === runId) return job;
    await container.queue.complete(job);
  }
  throw new Error(`Expected to claim workflow run ${runId}`);
}

export async function executeClaimedRun(container: Container, runId: string): Promise<void> {
  const job = await claimRunJob(container, runId);
  await container.orchestration.execute(runId, leaseFor(job));
  await container.queue.complete(job);
}
