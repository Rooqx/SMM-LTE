const baseUrl = new URL(process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3001");
if (!/^https?:$/.test(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  throw new Error("LOAD_BASE_URL must be an HTTP(S) URL without embedded credentials");
}
const apiKey = process.env.LOAD_API_KEY;
if (!apiKey) throw new Error("LOAD_API_KEY is required");
const route = process.env.LOAD_ROUTE ?? "/v1/workspaces?limit=30";
if (!route.startsWith("/") || route.startsWith("//")) {
  throw new Error("LOAD_ROUTE must be an absolute path on LOAD_BASE_URL");
}
const durationSeconds = Math.max(1, Math.min(86_400, Number(process.env.LOAD_DURATION_SECONDS ?? 30)));
const concurrency = Math.max(1, Math.min(200, Number(process.env.LOAD_CONCURRENCY ?? 10)));
const timeoutMs = Math.max(500, Math.min(120_000, Number(process.env.LOAD_TIMEOUT_MS ?? 10_000)));
const deadline = Date.now() + durationSeconds * 1_000;
const latencies = [];
const statuses = new Map();
let networkErrors = 0;

async function request() {
  const started = performance.now();
  try {
    const response = await fetch(new URL(route, baseUrl), {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
    await response.arrayBuffer();
  } catch {
    networkErrors += 1;
  } finally {
    latencies.push(performance.now() - started);
  }
}

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (Date.now() < deadline) await request();
}));

latencies.sort((left, right) => left - right);
const percentile = (value) => latencies[Math.min(
  latencies.length - 1,
  Math.floor(latencies.length * value),
)] ?? 0;
const report = {
  durationSeconds,
  concurrency,
  requests: latencies.length,
  requestsPerSecond: Number((latencies.length / durationSeconds).toFixed(2)),
  latencyMs: {
    p50: Number(percentile(0.5).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    p99: Number(percentile(0.99).toFixed(2)),
  },
  statuses: Object.fromEntries([...statuses].sort(([left], [right]) => left - right)),
  networkErrors,
};
console.log(JSON.stringify(report, null, 2));
if (networkErrors > 0 || [...statuses].some(([status]) => status >= 500)) process.exitCode = 1;
