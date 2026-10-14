import { createHash } from "node:crypto";
import type { MetricsService } from "./metrics.js";
import { OperationalLogger } from "./logger.js";

export const PERFORMANCE_STAGES = [
  "http_request",
  "authentication",
  "database_read",
  "answer_transaction",
  "enqueue_transaction",
  "queue_start_delay",
  "worker_start_transaction",
  "context_load",
  "prompt_build",
  "step_create_transaction",
  "provider_call",
  "output_validation",
  "result_commit",
] as const;

export type PerformanceStage = typeof PERFORMANCE_STAGES[number];
export type PerformanceOutcome = "ok" | "error";

type TraceFields = {
  stage: PerformanceStage;
  correlationId: string;
  durationMs: number;
  outcome?: PerformanceOutcome;
  runId?: string;
  workspaceId?: string;
  provider?: string;
  model?: string;
  developerPromptChars?: number;
  userPromptChars?: number;
};

function boundedIdentifier(value: string): string {
  return /^[A-Za-z0-9._:-]{1,160}$/.test(value) ? value : "invalid-correlation-id";
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Records content-free latency stages with bounded metric labels and sampled,
 * correlation-friendly structured logs. Sampling affects logs only; aggregate
 * metrics always include every observation.
 */
export class PerformanceTracer {
  readonly #logger = new OperationalLogger("performance");

  constructor(
    readonly metrics: MetricsService,
    readonly logSampleRate: number,
  ) {
    if (!Number.isFinite(logSampleRate) || logSampleRate < 0 || logSampleRate > 1) {
      throw new RangeError("Performance trace sample rate must be between 0 and 1");
    }
  }

  record(fields: TraceFields): void {
    const outcome = fields.outcome ?? "ok";
    const durationMs = Math.round(nonNegative(fields.durationMs) * 100) / 100;
    this.metrics.recordStage(fields.stage, outcome, durationMs);
    if (fields.developerPromptChars !== undefined) {
      this.metrics.recordPromptSize("developer", fields.developerPromptChars);
    }
    if (fields.userPromptChars !== undefined) {
      this.metrics.recordPromptSize("user", fields.userPromptChars);
    }
    const correlationId = boundedIdentifier(fields.correlationId);
    if (outcome === "ok" && !this.#sampled(correlationId)) return;
    const logFields = {
      stage: fields.stage,
      outcome,
      durationMs,
      correlationId,
      ...(fields.runId ? { runId: boundedIdentifier(fields.runId) } : {}),
      ...(fields.workspaceId ? { workspaceId: boundedIdentifier(fields.workspaceId) } : {}),
      ...(fields.provider ? { provider: fields.provider.slice(0, 120) } : {}),
      ...(fields.model ? { model: fields.model.slice(0, 200) } : {}),
      ...(fields.developerPromptChars === undefined
        ? {}
        : { developerInstructionChars: nonNegative(fields.developerPromptChars) }),
      ...(fields.userPromptChars === undefined
        ? {}
        : { userInputChars: nonNegative(fields.userPromptChars) }),
    };
    if (outcome === "error") this.#logger.warn(logFields, "Performance stage failed");
    else this.#logger.info(logFields, "Performance stage completed");
  }

  async measure<T>(
    fields: Omit<TraceFields, "durationMs" | "outcome">,
    operation: () => Promise<T>,
  ): Promise<T> {
    const startedAt = performance.now();
    try {
      const result = await operation();
      this.record({ ...fields, durationMs: performance.now() - startedAt, outcome: "ok" });
      return result;
    } catch (error) {
      this.record({ ...fields, durationMs: performance.now() - startedAt, outcome: "error" });
      throw error;
    }
  }

  #sampled(correlationId: string): boolean {
    if (this.logSampleRate >= 1) return true;
    if (this.logSampleRate <= 0) return false;
    const bucket = createHash("sha256").update(correlationId).digest().readUInt32BE(0) / 0x1_0000_0000;
    return bucket < this.logSampleRate;
  }
}
