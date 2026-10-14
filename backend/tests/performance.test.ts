import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { MetricsService } from "../src/observability/metrics.js";
import { PerformanceTracer } from "../src/observability/performance.js";

function fakePool(): pg.Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    totalCount: 4,
    idleCount: 3,
    waitingCount: 0,
  } as unknown as pg.Pool;
}

describe("content-free performance telemetry", () => {
  it("exports bounded stage and prompt-size aggregates", async () => {
    const metrics = new MetricsService(fakePool());
    metrics.recordStage("provider_call", "ok", 125.5);
    metrics.recordStage("provider_call", "ok", 75);
    metrics.recordStage("output_validation", "error", 2);
    metrics.recordPromptSize("developer", 1_200);
    metrics.recordPromptSize("developer", 800);
    metrics.recordPromptSize("user", 300);
    metrics.recordOptionAssistant({
      provider: "openai",
      model: "small-model",
      outcome: "generated",
      inputTokens: 120,
      outputTokens: 40,
      estimatedCostMicrousd: 2,
    });
    metrics.recordOptionAssistant({
      provider: "openai",
      model: "small-model",
      outcome: "cache_hit",
    });

    const rendered = await metrics.render();
    expect(rendered).toContain(
      'smm_performance_stage_observations_total{stage="provider_call",outcome="ok"} 2',
    );
    expect(rendered).toContain(
      'smm_performance_stage_duration_milliseconds_max{stage="provider_call",outcome="ok"} 125.5',
    );
    expect(rendered).toContain(
      'smm_performance_stage_duration_milliseconds_bucket{stage="provider_call",outcome="ok",le="100"} 1',
    );
    expect(rendered).toContain(
      'smm_performance_stage_duration_milliseconds_bucket{stage="provider_call",outcome="ok",le="250"} 2',
    );
    expect(rendered).toContain('smm_compiled_prompt_characters_total{kind="developer"} 2000');
    expect(rendered).toContain('smm_compiled_prompt_characters_max{kind="user"} 300');
    expect(rendered).toContain(
      'smm_option_assistant_events_total{provider="openai",model="small-model",outcome="generated"} 1',
    );
    expect(rendered).toContain(
      'smm_option_assistant_input_tokens_total{provider="openai",model="small-model",outcome="generated"} 120',
    );
    expect(rendered).toContain(
      'smm_option_assistant_estimated_cost_microusd_total{provider="openai",model="small-model",outcome="generated"} 2',
    );
  });

  it("measures successful and failed operations without recording operation data", async () => {
    const metrics = new MetricsService(fakePool());
    const tracer = new PerformanceTracer(metrics, 0);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(tracer.measure({
      stage: "database_read",
      correlationId: "request-1",
    }, async () => "ok")).resolves.toBe("ok");
    await expect(tracer.measure({
      stage: "database_read",
      correlationId: "request-2",
    }, async () => {
      throw new Error("sensitive operation detail");
    })).rejects.toThrow("sensitive operation detail");

    const rendered = await metrics.render();
    expect(rendered).toContain(
      'smm_performance_stage_observations_total{stage="database_read",outcome="ok"} 1',
    );
    expect(rendered).toContain(
      'smm_performance_stage_observations_total{stage="database_read",outcome="error"} 1',
    );
    expect(warning).toHaveBeenCalledOnce();
    expect(String(warning.mock.calls[0]?.[0])).not.toContain("sensitive operation detail");
    warning.mockRestore();
  });
});
