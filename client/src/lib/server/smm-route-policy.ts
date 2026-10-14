const UUID_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const routes: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^(health|ready)$/ },
  { method: "GET", pattern: /^v1\/workspaces$/ },
  { method: "POST", pattern: /^v1\/workspaces$/ },
  { method: "GET", pattern: /^v1\/account\/preferences$/ },
  { method: "PUT", pattern: /^v1\/account\/preferences$/ },
  { method: "GET", pattern: /^v1\/activity$/ },
  { method: "GET", pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}$`, "i") },
  { method: "PATCH", pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}$`, "i") },
  {
    method: "GET",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/context$`, "i"),
  },
  {
    method: "GET",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/context/history$`, "i"),
  },
  {
    method: "POST",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/continue$`, "i"),
  },
  {
    method: "POST",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/content-cycles$`, "i"),
  },
  {
    method: "GET",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/workflow$`, "i"),
  },
  {
    method: "POST",
    pattern: new RegExp(
      `^v1/workspaces/${UUID_SEGMENT}/questions/${UUID_SEGMENT}/answer$`,
      "i",
    ),
  },
  { method: "GET", pattern: new RegExp(`^v1/runs/${UUID_SEGMENT}$`, "i") },
  {
    method: "GET",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/runs$`, "i"),
  },
  {
    method: "POST",
    pattern: new RegExp(`^v1/runs/${UUID_SEGMENT}/(approve|reject|revise)$`, "i"),
  },
  {
    method: "GET",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/(artifacts|final-posts)$`, "i"),
  },
  { method: "GET", pattern: new RegExp(`^v1/artifacts/${UUID_SEGMENT}$`, "i") },
  { method: "GET", pattern: new RegExp(`^v1/final-posts/${UUID_SEGMENT}$`, "i") },
  {
    method: "POST",
    pattern: new RegExp(`^v1/final-posts/${UUID_SEGMENT}/publication$`, "i"),
  },
  {
    method: "POST",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/exports/obsidian/jobs$`, "i"),
  },
  {
    method: "GET",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/exports/obsidian/jobs$`, "i"),
  },
  {
    method: "GET",
    pattern: new RegExp(`^v1/exports/obsidian/jobs/${UUID_SEGMENT}$`, "i"),
  },
  {
    method: "POST",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/interview/start$`, "i"),
  },
  {
    method: "GET",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/interview$`, "i"),
  },
  {
    method: "POST",
    pattern: new RegExp(`^v1/workspaces/${UUID_SEGMENT}/interview/answers$`, "i"),
  },
  {
    method: "GET",
    pattern: new RegExp(
      `^v1/workspaces/${UUID_SEGMENT}/interview/questions/[a-z0-9_.-]+/options$`,
      "i",
    ),
  },
  {
    method: "POST",
    pattern: new RegExp(
      `^v1/workspaces/${UUID_SEGMENT}/interview/options/${UUID_SEGMENT}/present$`,
      "i",
    ),
  },
  {
    method: "POST",
    pattern: new RegExp(
      `^v1/workspaces/${UUID_SEGMENT}/interview/options/prefetch$`,
      "i",
    ),
  },
  {
    method: "GET",
    pattern: new RegExp(
      `^v1/workspaces/${UUID_SEGMENT}/runs/${UUID_SEGMENT}/events$`,
      "i",
    ),
  },
  {
    method: "GET",
    pattern: new RegExp(`^v1/runs/${UUID_SEGMENT}/events$`, "i"),
  },
];

/** Explicit browser capability list; service-only Fastify routes stay unreachable. */
export function isAllowedSmmRoute(method: string, path: string): boolean {
  return routes.some(
    (route) => route.method === method && route.pattern.test(path),
  );
}
