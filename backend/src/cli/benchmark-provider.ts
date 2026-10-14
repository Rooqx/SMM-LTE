import { randomUUID } from "node:crypto";
import { loadConfig } from "../config.js";
import { LlmActionSchema } from "../domain/schemas.js";
import { OpenAIProvider } from "../llm/openai-provider.js";

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.LLM_PROVIDER !== "openai" || !config.OPENAI_API_KEY) {
    throw new Error("Direct-provider benchmarking requires LLM_PROVIDER=openai and OPENAI_API_KEY");
  }
  const runs = Number.parseInt(process.env.BASELINE_BENCHMARK_RUNS ?? "5", 10);
  if (!Number.isInteger(runs) || runs < 1 || runs > 20) {
    throw new Error("BASELINE_BENCHMARK_RUNS must be an integer between 1 and 20");
  }
  const provider = new OpenAIProvider(config.OPENAI_API_KEY, config.OPENAI_MODEL, {
    ...(config.OPENAI_BASE_URL ? { baseURL: config.OPENAI_BASE_URL } : {}),
    timeoutMs: config.OPENAI_TIMEOUT_MS,
    // Benchmark one provider attempt. Durable workflow retries are measured separately.
    maxRetries: 0,
    maxOutputTokens: Math.min(config.OPENAI_MAX_OUTPUT_TOKENS, 256),
  });
  const developerPrompt = [
    "You are a latency benchmark.",
    "Return complete_step with the message 'benchmark complete'.",
    "Do not include any other content.",
  ].join("\n");
  const userPrompt = JSON.stringify({ task: "Measure one minimal structured-output response." });
  const samples: Array<{
    durationMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  }> = [];

  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    const result = await provider.execute({
      developerPrompt,
      userPrompt,
      allowedActionTypes: ["complete_step"],
      allowedCannotContinueReasons: [],
      correlationId: `baseline:${randomUUID()}`,
    });
    if (!LlmActionSchema.safeParse(result.action).success || result.action.type !== "complete_step") {
      throw new Error("Provider benchmark returned an invalid action");
    }
    samples.push({
      durationMs: Math.round(performance.now() - startedAt),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    });
  }

  const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  console.log(JSON.stringify({
    recordedAt: new Date().toISOString(),
    provider: "openai-compatible",
    model: config.OPENAI_MODEL,
    baseUrlConfigured: Boolean(config.OPENAI_BASE_URL),
    runs,
    promptCharacters: {
      developer: developerPrompt.length,
      user: userPrompt.length,
    },
    latencyMs: {
      minimum: durations[0],
      median: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      maximum: durations.at(-1),
    },
    tokenSamples: samples.map(({ inputTokens, outputTokens, totalTokens }) => ({
      inputTokens,
      outputTokens,
      totalTokens,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
