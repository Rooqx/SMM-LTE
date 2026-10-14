/**
 * Centralized, type-safe query key factories for TanStack Query.
 * Ensures consistent cache scoping, invalidation, and workspace isolation across Studio surfaces.
 */
export const studioQueryKeys = {
  workspaces: ["workspaces"] as const,

  workflow: (workspaceId?: string | undefined) =>
    ["workflow", workspaceId] as const,

  run: (runId?: string | null | undefined) =>
    ["run", runId] as const,

  artifacts: (
    workspaceId?: string | undefined,
    query?: Record<string, unknown> | undefined,
  ) => ["artifacts", workspaceId, query] as const,

  finalPosts: (
    workspaceId?: string | undefined,
    query?: Record<string, unknown> | undefined,
  ) => ["final-posts", workspaceId, query] as const,

  context: (workspaceId?: string | undefined) =>
    ["context", workspaceId] as const,

  contextHistory: (workspaceId?: string | undefined, key?: string | undefined) =>
    ["context-history", workspaceId, key] as const,

  activity: (workspaceId?: string | undefined) =>
    ["activity", workspaceId] as const,

  preferences: (userId?: string | undefined) =>
    ["preferences", userId] as const,

  obsidianJob: (jobId?: string | undefined) =>
    ["obsidian-job", jobId] as const,

  interview: (workspaceId?: string | undefined) =>
    ["interview", workspaceId] as const,

  interviewOptions: (
    workspaceId?: string | undefined,
    questionId?: string | undefined,
  ) => ["interview-options", workspaceId, questionId] as const,
};
