import type pg from "pg";
import type { PerformanceOutcome, PerformanceStage } from "./performance.js";

type RequestKey = `${string}|${string}|${number}`;
const STAGE_DURATION_BUCKETS_MS = [
  5, 10, 25, 50, 100, 250, 500, 1_000, 2_000, 5_000,
  10_000, 30_000, 60_000, 120_000, Number.POSITIVE_INFINITY,
] as const;

function labels(values: Record<string, string>): string {
  const body = Object.entries(values)
    .map(([key, value]) => `${key}="${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n")}"`)
    .join(",");
  return `{${body}}`;
}

function metric(name: string, value: number, metricLabels?: Record<string, string>): string {
  return `${name}${metricLabels ? labels(metricLabels) : ""} ${Number.isFinite(value) ? value : 0}`;
}

function nonNegativeInteger(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

/**
 * Process-local HTTP measurements plus authoritative PostgreSQL operational
 * aggregates. The output contains counts/latencies only—never tenant content,
 * prompts, email addresses, tokens, or job payloads.
 */
export class MetricsService {
  readonly #requests = new Map<RequestKey, { count: number; durationMs: number }>();
  readonly #admissionRejections = new Map<string, number>();
  readonly #stages = new Map<`${PerformanceStage}|${PerformanceOutcome}`, {
    count: number;
    durationMs: number;
    maximumDurationMs: number;
    bucketCounts: number[];
  }>();
  readonly #promptSizes = new Map<"developer" | "user", { count: number; chars: number; maximumChars: number }>();
  readonly #optionAssistant = new Map<string, {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostMicrousd: number;
  }>();

  constructor(readonly pool: pg.Pool) {}

  recordRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    const normalizedStatus = Math.floor(statusCode / 100) * 100;
    const key: RequestKey = `${method}|${route}|${normalizedStatus}`;
    const current = this.#requests.get(key) ?? { count: 0, durationMs: 0 };
    current.count += 1;
    current.durationMs += Math.max(0, durationMs);
    this.#requests.set(key, current);
  }

  /** Reasons come from a closed application-owned set, keeping label cardinality bounded. */
  recordAdmissionRejection(reason: string): void {
    this.#admissionRejections.set(reason, (this.#admissionRejections.get(reason) ?? 0) + 1);
  }

  recordStage(stage: PerformanceStage, outcome: PerformanceOutcome, durationMs: number): void {
    const key = `${stage}|${outcome}` as const;
    const current = this.#stages.get(key) ?? {
      count: 0,
      durationMs: 0,
      maximumDurationMs: 0,
      bucketCounts: STAGE_DURATION_BUCKETS_MS.map(() => 0),
    };
    const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    current.count += 1;
    current.durationMs += safeDuration;
    current.maximumDurationMs = Math.max(current.maximumDurationMs, safeDuration);
    STAGE_DURATION_BUCKETS_MS.forEach((upperBound, index) => {
      if (safeDuration <= upperBound) current.bucketCounts[index] = (current.bucketCounts[index] ?? 0) + 1;
    });
    this.#stages.set(key, current);
  }

  recordPromptSize(kind: "developer" | "user", chars: number): void {
    const current = this.#promptSizes.get(kind) ?? { count: 0, chars: 0, maximumChars: 0 };
    const safeChars = Number.isFinite(chars) ? Math.max(0, Math.floor(chars)) : 0;
    current.count += 1;
    current.chars += safeChars;
    current.maximumChars = Math.max(current.maximumChars, safeChars);
    this.#promptSizes.set(kind, current);
  }

  /** Records bounded, content-free option-assistant outcomes and usage. */
  recordOptionAssistant(input: {
    provider: string;
    model: string;
    outcome: "generated" | "cache_hit" | "fallback";
    inputTokens?: number | null;
    outputTokens?: number | null;
    estimatedCostMicrousd?: number | null;
  }): void {
    const provider = input.provider.slice(0, 120);
    const model = input.model.slice(0, 200);
    const key = JSON.stringify([provider, model, input.outcome]);
    const current = this.#optionAssistant.get(key) ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostMicrousd: 0,
    };
    current.calls += 1;
    current.inputTokens += nonNegativeInteger(input.inputTokens);
    current.outputTokens += nonNegativeInteger(input.outputTokens);
    current.estimatedCostMicrousd += nonNegativeInteger(input.estimatedCostMicrousd);
    this.#optionAssistant.set(key, current);
  }

  #sseConnectionsOpened = 0;
  #sseConnectionsClosed = 0;
  #sseEventsEmitted = 0;

  recordSseConnectionOpened(): void {
    this.#sseConnectionsOpened += 1;
  }

  recordSseConnectionClosed(): void {
    this.#sseConnectionsClosed += 1;
  }

  recordSseEventEmitted(): void {
    this.#sseEventsEmitted += 1;
  }

  async render(): Promise<string> {
    const [queue, events, usage, workflow, optionalSkills, progressEvents] = await Promise.all([
      this.pool.query(
        `SELECT type, status, count(*)::integer AS count,
                COALESCE(max(extract(epoch FROM now() - created_at)), 0)::float8 AS oldest_seconds
         FROM job_queue
         GROUP BY type, status
         ORDER BY type, status`,
      ),
      this.pool.query(
        `SELECT event, count(*)::integer AS count
         FROM job_attempt_events
         WHERE occurred_at >= now() - interval '24 hours'
         GROUP BY event ORDER BY event`,
      ),
      this.pool.query(
        `SELECT provider, model, count(*)::integer AS calls,
                COALESCE(sum(COALESCE(
                  total_tokens,
                  COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)
                )), 0)::float8 AS tokens,
                COALESCE(sum(estimated_cost_microusd), 0)::float8 AS cost_microusd,
                COALESCE(avg(duration_ms), 0)::float8 AS average_duration_ms
         FROM llm_usage
         WHERE created_at >= now() - interval '24 hours'
         GROUP BY provider, model ORDER BY provider, model`,
      ),
      this.pool.query(
        `SELECT
           (SELECT count(*)::integer FROM approvals WHERE status = 'pending') AS pending_approvals,
           (SELECT COALESCE(max(extract(epoch FROM now() - requested_at)), 0)::float8
              FROM approvals WHERE status = 'pending') AS oldest_pending_seconds,
           (SELECT COALESCE(avg(extract(epoch FROM decided_at - requested_at)), 0)::float8
              FROM approvals WHERE decided_at IS NOT NULL) AS approval_turnaround_seconds,
           (SELECT COALESCE(avg(extract(epoch FROM completed_at - started_at)), 0)::float8
              FROM phase_instances WHERE completed_at IS NOT NULL) AS phase_duration_seconds`,
      ),
      this.pool.query(
        `SELECT count(*)::integer AS count
         FROM conversation_messages
         WHERE kind = 'action'
           AND data->'action'->>'type' = 'request_optional_skill'
           AND created_at >= now() - interval '24 hours'`,
      ),
      this.pool.query(
        `SELECT stage, count(*)::integer AS count
         FROM workflow_run_progress_events
         WHERE occurred_at >= now() - interval '24 hours'
         GROUP BY stage ORDER BY stage`,
      ).catch(() => ({ rows: [] })),
    ]);

    const lines = [
      "# HELP smm_http_requests_total HTTP requests handled by this API process.",
      "# TYPE smm_http_requests_total counter",
      "# HELP smm_http_request_duration_milliseconds_total Cumulative HTTP request latency.",
      "# TYPE smm_http_request_duration_milliseconds_total counter",
    ];
    for (const [key, value] of this.#requests) {
      const [method, route, status] = key.split("|") as [string, string, string];
      const metricLabels = { method, route, status };
      lines.push(metric("smm_http_requests_total", value.count, metricLabels));
      lines.push(metric("smm_http_request_duration_milliseconds_total", value.durationMs, metricLabels));
    }
    lines.push(
      "# HELP smm_queue_admission_rejections_total Queue admissions rejected by bounded policy reason.",
      "# TYPE smm_queue_admission_rejections_total counter",
    );
    for (const [reason, count] of this.#admissionRejections) {
      lines.push(metric("smm_queue_admission_rejections_total", count, { reason }));
    }

    lines.push(
      "# HELP smm_performance_stage_observations_total Content-free performance stage observations.",
      "# TYPE smm_performance_stage_observations_total counter",
      "# HELP smm_performance_stage_duration_milliseconds_total Cumulative performance stage latency.",
      "# TYPE smm_performance_stage_duration_milliseconds_total counter",
      "# HELP smm_performance_stage_duration_milliseconds_max Process-local maximum performance stage latency.",
      "# TYPE smm_performance_stage_duration_milliseconds_max gauge",
      "# HELP smm_performance_stage_duration_milliseconds Process-local performance stage latency histogram.",
      "# TYPE smm_performance_stage_duration_milliseconds histogram",
    );
    for (const [key, value] of this.#stages) {
      const [stage, outcome] = key.split("|") as [PerformanceStage, PerformanceOutcome];
      const metricLabels = { stage, outcome };
      lines.push(metric("smm_performance_stage_observations_total", value.count, metricLabels));
      lines.push(metric("smm_performance_stage_duration_milliseconds_total", value.durationMs, metricLabels));
      lines.push(metric("smm_performance_stage_duration_milliseconds_max", value.maximumDurationMs, metricLabels));
      STAGE_DURATION_BUCKETS_MS.forEach((upperBound, index) => {
        lines.push(metric(
          "smm_performance_stage_duration_milliseconds_bucket",
          value.bucketCounts[index] ?? 0,
          { ...metricLabels, le: Number.isFinite(upperBound) ? String(upperBound) : "+Inf" },
        ));
      });
      lines.push(metric("smm_performance_stage_duration_milliseconds_sum", value.durationMs, metricLabels));
      lines.push(metric("smm_performance_stage_duration_milliseconds_count", value.count, metricLabels));
    }
    lines.push(
      "# HELP smm_compiled_prompt_observations_total Compiled prompt size observations.",
      "# TYPE smm_compiled_prompt_observations_total counter",
      "# HELP smm_compiled_prompt_characters_total Cumulative compiled prompt characters.",
      "# TYPE smm_compiled_prompt_characters_total counter",
      "# HELP smm_compiled_prompt_characters_max Process-local maximum compiled prompt characters.",
      "# TYPE smm_compiled_prompt_characters_max gauge",
    );
    for (const [kind, value] of this.#promptSizes) {
      lines.push(metric("smm_compiled_prompt_observations_total", value.count, { kind }));
      lines.push(metric("smm_compiled_prompt_characters_total", value.chars, { kind }));
      lines.push(metric("smm_compiled_prompt_characters_max", value.maximumChars, { kind }));
    }
    lines.push(
      "# HELP smm_option_assistant_events_total Option-assistant generation, cache, and fallback events.",
      "# TYPE smm_option_assistant_events_total counter",
      "# HELP smm_option_assistant_input_tokens_total Option-assistant input tokens reported by the provider.",
      "# TYPE smm_option_assistant_input_tokens_total counter",
      "# HELP smm_option_assistant_output_tokens_total Option-assistant output tokens reported by the provider.",
      "# TYPE smm_option_assistant_output_tokens_total counter",
      "# HELP smm_option_assistant_estimated_cost_microusd_total Configured option-assistant cost estimate.",
      "# TYPE smm_option_assistant_estimated_cost_microusd_total counter",
    );
    for (const [key, value] of this.#optionAssistant) {
      const [provider, model, outcome] = JSON.parse(key) as [string, string, string];
      const metricLabels = { provider, model, outcome };
      lines.push(metric("smm_option_assistant_events_total", value.calls, metricLabels));
      lines.push(metric("smm_option_assistant_input_tokens_total", value.inputTokens, metricLabels));
      lines.push(metric("smm_option_assistant_output_tokens_total", value.outputTokens, metricLabels));
      lines.push(metric(
        "smm_option_assistant_estimated_cost_microusd_total",
        value.estimatedCostMicrousd,
        metricLabels,
      ));
    }

    lines.push(
      "# HELP smm_job_queue_total Current jobs by type and status.",
      "# TYPE smm_job_queue_total gauge",
      "# HELP smm_job_queue_oldest_seconds Age of the oldest job in a type/status bucket.",
      "# TYPE smm_job_queue_oldest_seconds gauge",
    );
    for (const row of queue.rows as Array<Record<string, unknown>>) {
      const metricLabels = { type: String(row.type), status: String(row.status) };
      lines.push(metric("smm_job_queue_total", Number(row.count), metricLabels));
      lines.push(metric("smm_job_queue_oldest_seconds", Number(row.oldest_seconds), metricLabels));
    }
    for (const row of events.rows as Array<Record<string, unknown>>) {
      lines.push(metric("smm_job_events_24h_total", Number(row.count), { event: String(row.event) }));
    }
    for (const row of usage.rows as Array<Record<string, unknown>>) {
      const metricLabels = { provider: String(row.provider), model: String(row.model) };
      lines.push(metric("smm_model_calls_24h_total", Number(row.calls), metricLabels));
      lines.push(metric("smm_model_tokens_24h_total", Number(row.tokens), metricLabels));
      lines.push(metric("smm_model_estimated_cost_microusd_24h", Number(row.cost_microusd), metricLabels));
      lines.push(metric("smm_model_average_duration_milliseconds_24h", Number(row.average_duration_ms), metricLabels));
    }
    const workflowRow = workflow.rows[0] as Record<string, unknown> | undefined;
    lines.push(metric("smm_pending_approvals", Number(workflowRow?.pending_approvals ?? 0)));
    lines.push(metric("smm_oldest_pending_approval_seconds", Number(workflowRow?.oldest_pending_seconds ?? 0)));
    lines.push(metric("smm_approval_turnaround_average_seconds", Number(workflowRow?.approval_turnaround_seconds ?? 0)));
    lines.push(metric("smm_phase_duration_average_seconds", Number(workflowRow?.phase_duration_seconds ?? 0)));
    lines.push(
      "# HELP smm_sse_connections_opened_total Total Server-Sent Events streams opened.",
      "# TYPE smm_sse_connections_opened_total counter",
      "# HELP smm_sse_connections_closed_total Total Server-Sent Events streams closed.",
      "# TYPE smm_sse_connections_closed_total counter",
      "# HELP smm_sse_events_emitted_total Total run progress events emitted over Server-Sent Events.",
      "# TYPE smm_sse_events_emitted_total counter",
    );
    lines.push(metric("smm_sse_connections_opened_total", this.#sseConnectionsOpened));
    lines.push(metric("smm_sse_connections_closed_total", this.#sseConnectionsClosed));
    lines.push(metric("smm_sse_events_emitted_total", this.#sseEventsEmitted));
    lines.push(
      "# HELP smm_run_progress_events_24h_total Run progress stage events recorded in the last 24 hours.",
      "# TYPE smm_run_progress_events_24h_total counter",
    );
    for (const row of (progressEvents?.rows ?? []) as Array<Record<string, unknown>>) {
      lines.push(metric("smm_run_progress_events_24h_total", Number(row.count), { stage: String(row.stage) }));
    }
    lines.push(metric("smm_database_pool_total", this.pool.totalCount));
    lines.push(metric("smm_database_pool_idle", this.pool.idleCount));
    lines.push(metric("smm_database_pool_waiting", this.pool.waitingCount));
    return `${lines.join("\n")}\n`;
  }
}
