import type { AppConfig } from "../config.js";
import {
  LeaseLostError,
  PermanentJobError,
  leaseFor,
  type ClaimedJob,
  type JobQueue,
} from "../db/jobs.js";
import type { EmailDeliveryService } from "../email/delivery.js";
import { AppError } from "../domain/errors.js";
import { PermanentExportError, type ObsidianExporter } from "../obsidian/exporter.js";
import { OperationalLogger } from "../observability/logger.js";
import type { OrchestrationService } from "./service.js";

import type { OptionAssistantService } from "../interview/options/service.js";

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class Worker {
  #stopping = false;
  #activeModelJobs = 0;
  readonly #active = new Set<Promise<void>>();

  constructor(
    readonly config: AppConfig,
    readonly queue: JobQueue,
    readonly orchestration: OrchestrationService,
    readonly emailDelivery: EmailDeliveryService,
    readonly obsidian: ObsidianExporter | null,
    readonly optionAssistant: OptionAssistantService | null = null,
    readonly logger = new OperationalLogger("worker"),
  ) {}

  stop(): void {
    this.#stopping = true;
  }

  async run(): Promise<void> {
    await this.#recover();
    let nextRecoveryAt = Date.now() + this.config.WORKER_RECOVERY_INTERVAL_MS;

    while (!this.#stopping) {
      if (Date.now() >= nextRecoveryAt) {
        try {
          await this.#recover();
        } catch (error) {
          this.logger.error({ error }, "Transient failure during recovery scan");
        }
        nextRecoveryAt = Date.now() + this.config.WORKER_RECOVERY_INTERVAL_MS;
      }

      if (this.#active.size >= this.config.WORKER_CONCURRENCY) {
        await Promise.race(this.#active);
        continue;
      }

      const allowedTypes: string[] = [];
      if (this.#activeModelJobs < this.config.WORKER_MODEL_CONCURRENCY) {
        allowedTypes.push("execute_workflow_run");
        if (this.optionAssistant) allowedTypes.push("generate_interview_options");
      }
      if (this.emailDelivery.enabled) allowedTypes.push("send_auth_email");
      if (this.obsidian) allowedTypes.push("export_obsidian");

      let job: Awaited<ReturnType<JobQueue["claim"]>> = null;
      try {
        job = await this.queue.claim(allowedTypes);
      } catch (error) {
        this.logger.error({ error }, "Transient failure claiming job from queue");
        await wait(this.config.WORKER_POLL_MS);
        continue;
      }
      if (!job) {
        if (this.#active.size > 0) {
          await Promise.race([Promise.race(this.#active), wait(this.config.WORKER_POLL_MS)]);
        } else {
          await wait(this.config.WORKER_POLL_MS);
        }
        continue;
      }

      const isModelJob = job.type === "execute_workflow_run" ||
        job.type === "generate_interview_options";
      if (isModelJob) this.#activeModelJobs += 1;
      const task = this.#process(job)
        .catch((error) => {
          this.logger.error({
            error,
            jobId: job.id,
            jobType: job.type,
            correlationId: job.correlation_id,
          }, "Unexpected worker job failure");
        })
        .finally(() => {
          this.#active.delete(task);
          if (isModelJob) this.#activeModelJobs -= 1;
        });
      this.#active.add(task);
    }

    // Stop claiming first, then let bounded provider timeouts and lease renewal
    // carry already-claimed work to a safe terminal state.
    await Promise.allSettled(this.#active);
  }

  async #recover(): Promise<void> {
    let recovered = 0;
    do {
      recovered = await this.queue.recoverExpiredJobs(100);
      if (recovered > 0) {
        this.logger.warn({ recovered }, "Recovered expired job leases");
      }
    } while (recovered === 100 && !this.#stopping);

    if (this.optionAssistant) {
      const deleted = await this.optionAssistant.cache.deleteExpired();
      if (deleted > 0) {
        this.logger.info({ deleted }, "Deleted expired option-assistant cache entries");
      }
    }
  }

  async #process(job: ClaimedJob): Promise<void> {
    this.logger.info({
      jobId: job.id,
      jobType: job.type,
      attempt: job.attempts,
      leaseToken: job.lease_token,
      correlationId: job.correlation_id,
    }, "Claimed job");

    let renewing = false;
    let leaseFailure: LeaseLostError | null = null;
    let renewalPromise: Promise<void> | null = null;
    const heartbeat = setInterval(() => {
      if (renewing || leaseFailure) return;
      renewing = true;
      renewalPromise = this.queue.renew(job)
        .catch((error: unknown) => {
          leaseFailure = error instanceof LeaseLostError
            ? error
            : new LeaseLostError("Lease renewal failed before job completion");
          this.logger.warn({
            error,
            jobId: job.id,
            leaseToken: job.lease_token,
            correlationId: job.correlation_id,
          }, "Job lease renewal failed");
        })
        .finally(() => {
          renewing = false;
          renewalPromise = null;
        });
    }, this.config.WORKER_LEASE_RENEW_MS);
    heartbeat.unref();

    try {
      await this.#execute(job);
      clearInterval(heartbeat);
      const pendingRenewal = renewalPromise;
      if (pendingRenewal) await pendingRenewal;
      if (leaseFailure) throw leaseFailure;
      await this.queue.complete(job);
      this.logger.info({
        jobId: job.id,
        jobType: job.type,
        attempt: job.attempts,
        correlationId: job.correlation_id,
      }, "Completed job");
    } catch (error) {
      clearInterval(heartbeat);
      const pendingRenewal = renewalPromise;
      if (pendingRenewal) await pendingRenewal;
      if (error instanceof LeaseLostError || leaseFailure) {
        this.logger.warn({
          error: error instanceof LeaseLostError ? error : leaseFailure,
          jobId: job.id,
          leaseToken: job.lease_token,
          correlationId: job.correlation_id,
        }, "Discarded work from a stale job lease");
        return;
      }
      try {
        const result = await this.queue.fail(job, error, {
          permanent: error instanceof PermanentJobError,
        });
        this.logger.warn({
          error,
          jobId: job.id,
          jobType: job.type,
          attempt: job.attempts,
          dead: result.dead,
          correlationId: job.correlation_id,
        }, result.dead ? "Job moved to dead state" : "Job scheduled for retry");
      } catch (failure) {
        if (failure instanceof LeaseLostError) {
          this.logger.warn({
            jobId: job.id,
            leaseToken: job.lease_token,
            correlationId: job.correlation_id,
          }, "Job failure was ignored because its lease was reclaimed");
          return;
        }
        throw failure;
      }
    } finally {
      clearInterval(heartbeat);
    }
  }

  async #execute(job: ClaimedJob): Promise<void> {
    if (job.type === "send_auth_email") {
      await this.emailDelivery.deliver(job);
      return;
    }
    if (job.type === "execute_workflow_run") {
      const runId = job.payload.runId;
      if (typeof runId !== "string") {
        throw new PermanentJobError("Job payload is missing runId");
      }
      await this.orchestration.execute(runId, leaseFor(job), job.correlation_id);
      return;
    }
    if (job.type === "export_obsidian") {
      if (!this.obsidian) throw new Error("Obsidian export is not configured on this worker");
      const workspaceId = job.payload.workspaceId;
      const organizationId = job.payload.organizationId;
      if (typeof workspaceId !== "string" || typeof organizationId !== "string") {
        throw new PermanentJobError("Obsidian export job payload is invalid");
      }
      try {
        await this.obsidian.exportWorkspace(workspaceId, organizationId);
      } catch (error) {
        if (error instanceof PermanentExportError ||
            (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500)) {
          throw new PermanentJobError(error.message);
        }
        throw error;
      }
      return;
    }
    if (job.type === "generate_interview_options") {
      if (!this.optionAssistant) {
        throw new PermanentJobError("Option assistant is not configured on this worker");
      }
      await this.optionAssistant.processJob(job);
      return;
    }
    throw new PermanentJobError(`Unsupported job type: ${job.type}`);
  }
}
