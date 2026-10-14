import { z } from "zod";
import {
  accountPreferencesSchema,
  activityPageSchema,
  answerQuestionResponseSchema,
  apiErrorSchema,
  artifactPageSchema,
  artifactSchema,
  contextItemSchema,
  contextPageSchema,
  contextRevisionPageSchema,
  continueResponseSchema,
  contentCycleResponseSchema,
  finalPostPageSchema,
  finalPostSchema,
  obsidianJobSchema,
  obsidianJobPageSchema,
  publicationResultSchema,
  revisionResponseSchema,
  runSchema,
  runSummaryPageSchema,
  workflowStateSchema,
  workspacePageSchema,
  workspaceSchema,
  interviewStateSchema,
  submitGuidedAnswerResponseSchema,
  interviewOptionSetResponseSchema,
  type AnswerChoice,
  type AnswerQuestionResponse,
  type AccountPreferences,
  type ActivityPage,
  type Artifact,
  type ArtifactPage,
  type ContextItem,
  type ContextPage,
  type ContextRevisionPage,
  type ContinueResponse,
  type ContentCycleResponse,
  type FinalPost,
  type FinalPostPage,
  type ObsidianJob,
  type ObsidianJobPage,
  type PublicationResult,
  type RevisionResponse,
  type Run,
  type RunSummaryPage,
  type WorkflowState,
  type Workspace,
  type WorkspacePage,
  type InterviewState,
  type SubmitGuidedAnswerBody,
  type SubmitGuidedAnswerResponse,
  type InterviewOptionSetResponse,
  type RunProgressEvent,
} from "./contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code = "REQUEST_FAILED",
    readonly status = 500,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (init?.body) headers.set("content-type", "application/json");

  const response = await fetch(`/api/smm/${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);
    throw new ApiError(
      parsedError.success
        ? parsedError.data.error.message
        : "The request could not be completed.",
      parsedError.success ? parsedError.data.error.code : "REQUEST_FAILED",
      response.status,
      response.headers.get("x-request-id") ?? undefined,
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      "The server returned data in an unexpected format.",
      "INVALID_RESPONSE",
      502,
    );
  }
  return parsed.data;
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

const workspaceListCompatSchema = z.union([
  workspacePageSchema,
  z.array(workspaceSchema).transform((items) => ({ workspaces: items, nextCursor: null })),
]);

const contextListCompatSchema = z.union([
  contextPageSchema,
  z.array(contextItemSchema).transform((items) => ({ context: items, nextCursor: null })),
]);

export const api = {
  health: (init?: RequestInit) =>
    request("health", z.object({ status: z.string() }), init),

  readiness: (init?: RequestInit) =>
    request("ready", z.looseObject({ status: z.string() }), init),

  listWorkspaces: (
    query?: { limit?: number; cursor?: string | null },
    init?: RequestInit,
  ): Promise<WorkspacePage> =>
    request(`v1/workspaces${buildQuery(query)}`, workspaceListCompatSchema, init),

  createWorkspace: (
    input: { name: string; slug: string; timezone: string },
    init?: RequestInit,
  ): Promise<Workspace> =>
    request("v1/workspaces", workspaceSchema, {
      ...init,
      method: "POST",
      body: JSON.stringify(input),
    }),

  getWorkspace: (id: string, init?: RequestInit): Promise<Workspace> =>
    request(`v1/workspaces/${id}`, workspaceSchema, init),

  updateWorkspace: (
    id: string,
    input: { expectedVersion: number; name?: string; timezone?: string },
    init?: RequestInit,
  ): Promise<Workspace> =>
    request(`v1/workspaces/${id}`, workspaceSchema, {
      ...init,
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  getPreferences: (init?: RequestInit): Promise<AccountPreferences> =>
    request("v1/account/preferences", accountPreferencesSchema, init),

  updatePreferences: (
    input: {
      expectedVersion: number;
      timezone: string;
      theme: "dark" | "light" | "system";
      emailNotifications: boolean;
      autopilotEnabled: boolean;
      reviewRemindersEnabled: boolean;
    },
    init?: RequestInit,
  ): Promise<AccountPreferences> =>
    request("v1/account/preferences", accountPreferencesSchema, {
      ...init,
      method: "PUT",
      body: JSON.stringify(input),
    }),

  // Today orchestration contracts
  getWorkflow: (workspaceId: string, init?: RequestInit): Promise<WorkflowState> =>
    request(`v1/workspaces/${workspaceId}/workflow`, workflowStateSchema, init),

  continueWorkflow: (
    workspaceId: string,
    idempotencyKey: string,
    init?: RequestInit,
  ): Promise<ContinueResponse> =>
    request(`v1/workspaces/${workspaceId}/continue`, continueResponseSchema, {
      ...init,
      method: "POST",
      body: JSON.stringify({ idempotencyKey }),
    }),

  startContentCycle: (
    workspaceId: string,
    input:
      | {
          mode: "next_week";
          weekStart?: string;
          changes?: string;
          nothingChanged: boolean;
          idempotencyKey: string;
        }
      | {
          mode: "extra_posts";
          topic: string;
          platforms: string[];
          quantity: number;
          publicationDate: string;
          instructions?: string;
          idempotencyKey: string;
        }
      | {
          mode: "refresh_strategy";
          changes: string;
          idempotencyKey: string;
        },
    init?: RequestInit,
  ): Promise<ContentCycleResponse> =>
    request(`v1/workspaces/${workspaceId}/content-cycles`, contentCycleResponseSchema, {
      ...init,
      method: "POST",
      body: JSON.stringify(input),
    }),

  answerQuestion: (
    workspaceId: string,
    questionId: string,
    input: {
      expectedVersion: number;
      answer: AnswerChoice;
      idempotencyKey: string;
    },
    init?: RequestInit,
  ): Promise<AnswerQuestionResponse> =>
    request(
      `v1/workspaces/${workspaceId}/questions/${questionId}/answer`,
      answerQuestionResponseSchema,
      {
        ...init,
        method: "POST",
        body: JSON.stringify(input),
      },
    ),

  // Review & revision contracts
  getRun: (runId: string, init?: RequestInit): Promise<Run> =>
    request(`v1/runs/${runId}`, runSchema, init),

  listRuns: (
    workspaceId: string,
    query?: { limit?: number; cursor?: string | null },
    init?: RequestInit,
  ): Promise<RunSummaryPage> =>
    request(`v1/workspaces/${workspaceId}/runs${buildQuery(query)}`, runSummaryPageSchema, init),

  listActivity: (
    query?: { workspaceId?: string; limit?: number; cursor?: string | null },
    init?: RequestInit,
  ): Promise<ActivityPage> =>
    request(`v1/activity${buildQuery(query)}`, activityPageSchema, init),

  decideRun: (
    runId: string,
    decision: "approve" | "reject",
    note?: string,
    init?: RequestInit,
  ): Promise<Run> =>
    request(`v1/runs/${runId}/${decision}`, runSchema, {
      ...init,
      method: "POST",
      body: JSON.stringify({ note: note ?? null }),
    }),

  reviseRun: (
    runId: string,
    input: {
      expectedReviewRevision: number;
      instructions: string;
      idempotencyKey: string;
    },
    init?: RequestInit,
  ): Promise<RevisionResponse> =>
    request(`v1/runs/${runId}/revise`, revisionResponseSchema, {
      ...init,
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Library deliverables contracts
  listArtifacts: (
    workspaceId: string,
    query?: {
      limit?: number;
      cursor?: string | null;
      status?: "draft" | "approved" | "rejected" | "superseded";
      kind?: string;
      logicalId?: string;
      search?: string;
    },
    init?: RequestInit,
  ): Promise<ArtifactPage> =>
    request(`v1/workspaces/${workspaceId}/artifacts${buildQuery(query)}`, artifactPageSchema, init),

  getArtifact: (artifactId: string, init?: RequestInit): Promise<Artifact> =>
    request(`v1/artifacts/${artifactId}`, artifactSchema, init),

  listFinalPosts: (
    workspaceId: string,
    query?: {
      limit?: number;
      cursor?: string | null;
      status?: "draft" | "approved" | "rejected" | "superseded";
      platform?: string;
      sprint?: string;
      week?: number;
      campaign?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      view?: "flat" | "grouped";
    },
    init?: RequestInit,
  ): Promise<FinalPostPage> =>
    request(
      `v1/workspaces/${workspaceId}/final-posts${buildQuery(query)}`,
      finalPostPageSchema,
      init,
    ),

  getFinalPost: (postId: string, init?: RequestInit): Promise<FinalPost> =>
    request(`v1/final-posts/${postId}`, finalPostSchema, init),

  // Brand context contracts
  getContext: (
    workspaceId: string,
    query?: { limit?: number; cursor?: string | null },
    init?: RequestInit,
  ): Promise<ContextItem[]> =>
    request(
      `v1/workspaces/${workspaceId}/context${buildQuery(query)}`,
      contextListCompatSchema,
      init,
    ).then((res) => res.context),

  getContextPage: (
    workspaceId: string,
    query?: { limit?: number; cursor?: string | null },
    init?: RequestInit,
  ): Promise<ContextPage> =>
    request(
      `v1/workspaces/${workspaceId}/context${buildQuery(query)}`,
      contextListCompatSchema,
      init,
    ),

  getContextHistory: (
    workspaceId: string,
    query?: { key?: string; limit?: number; cursor?: string | null },
    init?: RequestInit,
  ): Promise<ContextRevisionPage> =>
    request(
      `v1/workspaces/${workspaceId}/context/history${buildQuery(query)}`,
      contextRevisionPageSchema,
      init,
    ),

  // Obsidian export contracts
  enqueueObsidianExportJob: (
    workspaceId: string,
    idempotencyKey: string,
    init?: RequestInit,
  ): Promise<ObsidianJob> =>
    request(
      `v1/workspaces/${workspaceId}/exports/obsidian/jobs`,
      obsidianJobSchema,
      {
        ...init,
        method: "POST",
        body: JSON.stringify({ idempotencyKey }),
      },
    ),

  listObsidianExportJobs: (
    workspaceId: string,
    query?: { limit?: number; cursor?: string | null },
    init?: RequestInit,
  ): Promise<ObsidianJobPage> =>
    request(
      `v1/workspaces/${workspaceId}/exports/obsidian/jobs${buildQuery(query)}`,
      obsidianJobPageSchema,
      init,
    ),

  getObsidianExportJob: (jobId: string, init?: RequestInit): Promise<ObsidianJob> =>
    request(`v1/exports/obsidian/jobs/${jobId}`, obsidianJobSchema, init),

  updatePublication: (
    postId: string,
    input: {
      expectedVersion: number;
      status: "not_scheduled" | "scheduled" | "published" | "failed" | "cancelled";
      idempotencyKey: string;
    },
    init?: RequestInit,
  ): Promise<PublicationResult> =>
    request(`v1/final-posts/${postId}/publication`, publicationResultSchema, {
      ...init,
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Guided Brand Intake Contracts (M9)
  startInterview: (
    workspaceId: string,
    input?: { questionnaireId?: string; questionnaireVersion?: string },
    init?: RequestInit,
  ): Promise<InterviewState> =>
    request(
      `v1/workspaces/${workspaceId}/interview/start`,
      interviewStateSchema,
      {
        ...init,
        method: "POST",
        body: JSON.stringify(input ?? {}),
      },
    ),

  getInterviewState: (
    workspaceId: string,
    init?: RequestInit,
  ): Promise<InterviewState | null> =>
    request(
      `v1/workspaces/${workspaceId}/interview`,
      interviewStateSchema,
      init,
    ).catch((error) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),

  submitInterviewAnswer: (
    workspaceId: string,
    input: SubmitGuidedAnswerBody,
    init?: RequestInit,
  ): Promise<SubmitGuidedAnswerResponse> =>
    request(
      `v1/workspaces/${workspaceId}/interview/answers`,
      submitGuidedAnswerResponseSchema,
      {
        ...init,
        method: "POST",
        body: JSON.stringify(input),
      },
    ),

  getInterviewOptions: (
    workspaceId: string,
    questionId: string,
    query?: { questionVersion?: number },
    init?: RequestInit,
  ): Promise<InterviewOptionSetResponse> =>
    request(
      `v1/workspaces/${workspaceId}/interview/questions/${encodeURIComponent(questionId)}/options${buildQuery(query)}`,
      interviewOptionSetResponseSchema,
      init,
    ),

  markOptionSetPresented: (
    workspaceId: string,
    optionSetId: string,
    input: { sessionId: string; interactionStarted?: boolean },
    init?: RequestInit,
  ): Promise<unknown> =>
    request(
      `v1/workspaces/${workspaceId}/interview/options/${optionSetId}/present`,
      z.unknown(),
      {
        ...init,
        method: "POST",
        body: JSON.stringify({
          sessionId: input.sessionId,
          interactionStarted: input.interactionStarted ?? false,
        }),
      },
    ),

  prefetchInterviewOptions: (
    workspaceId: string,
    input: {
      sessionId: string;
      questionnaireVersion: string;
      targetQuestionIds: string[];
    },
    init?: RequestInit,
  ): Promise<{ status: string }> =>
    request(
      `v1/workspaces/${workspaceId}/interview/options/prefetch`,
      z.object({ status: z.string() }),
      {
        ...init,
        method: "POST",
        body: JSON.stringify(input),
      },
    ),

  /**
   * Subscribes to real-time run progress events via Server-Sent Events.
   * Returns an unsubscribe/abort function. Falls back to caller polling on network failure.
   */
  connectRunEvents: (
    workspaceId: string,
    runId: string,
    handlers: {
      onEvent: (event: RunProgressEvent) => void;
      onError?: (error: Event) => void;
      onClose?: () => void;
    },
    options?: { lastEventId?: string },
  ): (() => void) => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return () => {};
    }
    const query = options?.lastEventId ? `?lastEventId=${options.lastEventId}` : "";
    const url = `/api/smm/v1/workspaces/${workspaceId}/runs/${runId}/events${query}`;
    const source = new EventSource(url, { withCredentials: true });

    source.addEventListener("progress", (event) => {
      try {
        const parsed = JSON.parse(event.data) as RunProgressEvent;
        handlers.onEvent(parsed);
      } catch {
        // ignore malformed frame
      }
    });

    source.onerror = (err) => {
      handlers.onError?.(err);
      source.close();
      handlers.onClose?.();
    };

    return () => {
      source.close();
      handlers.onClose?.();
    };
  },
};
