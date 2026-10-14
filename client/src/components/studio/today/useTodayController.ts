import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { UUID_REGEX, type AnswerChoice, type Run, type Workspace } from "@/lib/contracts";
import { studioQueryKeys } from "@/lib/query-keys";
import {
  selectTodayState,
  type TodayPresentationState,
} from "@/lib/today-selector";
import { isRunActive } from "@/lib/utils";

export interface TodayController {
  actionError: string | null;
  conflictMessage: string | null;
  dismissConflict: () => void;
  isApproving: boolean;
  isContinuing: boolean;
  isLoading: boolean;
  isRejecting: boolean;
  isRevising: boolean;
  isSubmittingAnswer: boolean;
  isSubmittingInterview: boolean;
  isStartingContentCycle: boolean;
  onApprove: () => Promise<void>;
  onContinue: () => Promise<void>;
  onInterviewSubmit: (input: {
    sessionId: string;
    expectedSessionVersion: number;
    questionId: string;
    questionVersion: number;
    optionSetId: string;
    selectedOptionIds: string[];
    customText?: string | undefined;
  }) => Promise<void>;
  onQuestionSubmit: (answer: AnswerChoice) => Promise<void>;
  onReject: () => Promise<void>;
  onStartContentCycle: (input:
    | { mode: "next_week"; weekStart?: string; changes?: string; nothingChanged: boolean }
    | { mode: "extra_posts"; topic: string; platforms: string[]; quantity: number; publicationDate: string; instructions?: string }
    | { mode: "refresh_strategy"; changes: string }
  ) => Promise<void>;
  onRetrySync: () => void;
  onRevise: (feedback: string) => Promise<void>;
  presentationState: TodayPresentationState;
  runProgressStage: string | null;
  userName: string | null;
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `key_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function shouldRetainIdempotencyKey(error: unknown): boolean {
  return (
    !(error instanceof ApiError) ||
    error.status === 408 ||
    error.status === 429 ||
    error.status >= 500
  );
}

function actionErrorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError
    ? error.message
    : "That action could not be completed. Please try again.";
}

function linkedRunId(): string | null {
  if (typeof window === "undefined") return null;
  const candidate = new URLSearchParams(window.location.search).get("run");
  return candidate && UUID_REGEX.test(candidate) ? candidate : null;
}

/**
 * Owns the Today surface's remote-state coordination.
 *
 * Keeping this policy outside the view makes the phase UI declarative while
 * preserving the important concurrency rules in one place: workspace cache
 * isolation, retry-stable idempotency keys, and stale-review recovery.
 */
export function useTodayController(workspace?: Workspace): TodayController {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userName =
    session?.user?.name || session?.user?.email?.split("@")[0] || null;
  const [activeRunId, setActiveRunId] = useState<string | null>(linkedRunId);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState<{
    runId: string;
    stage: string;
  } | null>(null);
  const continueIntentKeyRef = useRef<string | null>(null);
  const answerIntentKeyRef = useRef<{ signature: string; key: string } | null>(
    null,
  );
  const revisionIntentKeyRef = useRef<{
    signature: string;
    key: string;
  } | null>(null);
  const interviewIntentKeyRef = useRef<{
    signature: string;
    key: string;
  } | null>(null);
  const contentCycleIntentKeyRef = useRef<{
    signature: string;
    key: string;
  } | null>(null);

  const previousWorkspaceIdRef = useRef(workspace?.id);
  useEffect(() => {
    if (previousWorkspaceIdRef.current === workspace?.id) return;

    previousWorkspaceIdRef.current = workspace?.id;
    setActiveRunId(null);
    setConflictMessage(null);
    continueIntentKeyRef.current = null;
    answerIntentKeyRef.current = null;
    revisionIntentKeyRef.current = null;
    interviewIntentKeyRef.current = null;
    contentCycleIntentKeyRef.current = null;

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("run")) {
        url.searchParams.delete("run");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [workspace?.id]);

  useEffect(() => {
    if (!session?.user) queryClient.clear();
  }, [session?.user, queryClient]);

  const workflowQuery = useQuery({
    queryKey: studioQueryKeys.workflow(workspace?.id),
    queryFn: ({ signal }) => api.getWorkflow(workspace!.id, { signal }),
    enabled: Boolean(workspace?.id),
  });

  const isPhase1 =
    (workflowQuery.data?.phase ?? workspace?.current_phase ?? 1) === 1;

  const interviewQuery = useQuery({
    queryKey: studioQueryKeys.interview(workspace?.id),
    queryFn: ({ signal }) => api.getInterviewState(workspace!.id, { signal }),
    enabled: Boolean(workspace?.id && isPhase1),
  });

  // A URL pointer wins when present; otherwise the backend projection recovers
  // the workspace's current run without copying server state into local state.
  // An automatically queued next writing batch supersedes a completed URL
  // pointer. Always follow the backend's current active run when one exists.
  const resolvedRunId = workflowQuery.data?.activeRun?.id ?? activeRunId ?? null;

  // Persist only the opaque run UUID so refreshes remain linkable. Generated
  // content and credentials never enter browser route state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (resolvedRunId) url.searchParams.set("run", resolvedRunId);
    else url.searchParams.delete("run");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [resolvedRunId]);

  const finalPostsQuery = useQuery({
    queryKey: studioQueryKeys.finalPosts(workspace?.id),
    queryFn: ({ signal }) =>
      api.listFinalPosts(workspace!.id, undefined, { signal }),
    enabled: Boolean(
      workspace?.id &&
        (workflowQuery.data?.phase ?? workspace.current_phase) === 5,
    ),
  });

  const activeRunQuery = useQuery({
    queryKey: studioQueryKeys.run(resolvedRunId),
    queryFn: ({ signal }) => api.getRun(resolvedRunId!, { signal }),
    enabled: Boolean(resolvedRunId),
    refetchInterval: (query) => {
      const run = query.state.data as Run | undefined;
      if (!run || !isRunActive(run.status)) return false;
      return Math.min(1_500 * 2 ** query.state.fetchFailureCount, 15_000);
    },
  });

  const activeRunBelongsToWorkspace =
    !activeRunQuery.data ||
    !workspace ||
    activeRunQuery.data.workspace_id === workspace.id;
  const safeActiveRun = activeRunBelongsToWorkspace
    ? activeRunQuery.data
    : undefined;
  const safeActiveRunStatus = safeActiveRun?.status;

  // Connect to Server-Sent Events stream for real-time coarse progress updates
  useEffect(() => {
    if (
      !workspace?.id ||
      !resolvedRunId ||
      !safeActiveRunStatus ||
      !isRunActive(safeActiveRunStatus) ||
      typeof api.connectRunEvents !== "function"
    ) {
      return;
    }

    const disconnect = api.connectRunEvents(workspace.id, resolvedRunId, {
      onEvent: (event) => {
        setRunProgress({ runId: resolvedRunId, stage: event.stage });
      },
      onError: () => {
        // Fallback gracefully to bounded polling on activeRunQuery
      },
      onClose: () => {
        // Disconnected cleanly
      },
    });

    return () => {
      disconnect();
    };
  }, [workspace?.id, resolvedRunId, safeActiveRunStatus]);

  const presentationError = useMemo(
    () =>
      workflowQuery.error ??
      activeRunQuery.error ??
      finalPostsQuery.error ??
      interviewQuery.error ??
      (activeRunBelongsToWorkspace
        ? null
        : new Error("This run belongs to a different workspace.")),
    [
      workflowQuery.error,
      activeRunQuery.error,
      finalPostsQuery.error,
      interviewQuery.error,
      activeRunBelongsToWorkspace,
    ],
  );

  useEffect(() => {
    const run = activeRunQuery.data;
    if (!run || isRunActive(run.status)) return;

    const keys = [
      studioQueryKeys.workflow(workspace?.id),
      studioQueryKeys.artifacts(workspace?.id),
      studioQueryKeys.finalPosts(workspace?.id),
      studioQueryKeys.context(workspace?.id),
      studioQueryKeys.workspaces,
    ];
    for (const queryKey of keys) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [activeRunQuery.data, queryClient, workspace?.id]);

  const continueMutation = useMutation({
    mutationFn: async () => {
      if (!workspace?.id) throw new Error("Workspace required");
      const key = continueIntentKeyRef.current ?? generateIdempotencyKey();
      continueIntentKeyRef.current = key;
      try {
        return await api.continueWorkflow(workspace.id, key);
      } catch (error) {
        // An answer may have started a run before this click reached the API.
        // Reconcile with authoritative state instead of showing a false error.
        if (error instanceof ApiError && error.code === "workspace_busy") {
          const state = await api.getWorkflow(workspace.id);
          queryClient.setQueryData(studioQueryKeys.workflow(workspace.id), state);
          if (state.activeRun) return state.activeRun;
          if (state.pendingQuestion) return null;
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      continueIntentKeyRef.current = null;
      if (data) setActiveRunId(data.id);
      for (const queryKey of [
        studioQueryKeys.workflow(workspace?.id),
        studioQueryKeys.artifacts(workspace?.id),
        studioQueryKeys.workspaces,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error) => {
      if (!shouldRetainIdempotencyKey(error)) {
        continueIntentKeyRef.current = null;
      }
    },
  });

  const startInterviewMutation = useMutation({
    mutationFn: async () => {
      if (!workspace?.id) throw new Error("Workspace required");
      return api.startInterview(workspace.id);
    },
    onSuccess: (interview) => {
      // Publish the authoritative response directly so the first question is
      // visible immediately; the follow-up invalidation reconciles any option
      // personalization completed after the start request returned.
      queryClient.setQueryData(
        studioQueryKeys.interview(workspace?.id),
        interview,
      );
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.interview(workspace?.id),
      });
    },
  });

  const startContentCycleMutation = useMutation({
    mutationFn: async (input:
      | { mode: "next_week"; weekStart?: string; changes?: string; nothingChanged: boolean }
      | { mode: "extra_posts"; topic: string; platforms: string[]; quantity: number; publicationDate: string; instructions?: string }
      | { mode: "refresh_strategy"; changes: string }
    ) => {
      if (!workspace?.id) throw new Error("Workspace required");
      const signature = JSON.stringify(input);
      const key = contentCycleIntentKeyRef.current?.signature === signature
        ? contentCycleIntentKeyRef.current.key
        : generateIdempotencyKey();
      contentCycleIntentKeyRef.current = { signature, key };
      return api.startContentCycle(workspace.id, { ...input, idempotencyKey: key });
    },
    onSuccess: async (data) => {
      contentCycleIntentKeyRef.current = null;
      setActiveRunId(data.run.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studioQueryKeys.workflow(workspace?.id) }),
        queryClient.invalidateQueries({ queryKey: studioQueryKeys.finalPosts(workspace?.id) }),
        queryClient.invalidateQueries({ queryKey: studioQueryKeys.workspaces }),
      ]);
    },
    onError: (error) => {
      if (!shouldRetainIdempotencyKey(error)) contentCycleIntentKeyRef.current = null;
    },
  });

  const answerQuestionMutation = useMutation({
    mutationFn: async ({
      questionId,
      expectedVersion,
      answer,
    }: {
      questionId: string;
      expectedVersion: number;
      answer: AnswerChoice;
    }) => {
      if (!workspace?.id) throw new Error("Workspace required");
      const choice = answer;
      const signature = JSON.stringify({ questionId, expectedVersion, choice });
      const key =
        answerIntentKeyRef.current?.signature === signature
          ? answerIntentKeyRef.current.key
          : generateIdempotencyKey();
      answerIntentKeyRef.current = { signature, key };

      return api.answerQuestion(workspace.id, questionId, {
        expectedVersion,
        answer: choice,
        idempotencyKey: key,
      });
    },
    onSuccess: (data) => {
      answerIntentKeyRef.current = null;
      if (data.run?.id) setActiveRunId(data.run.id);
      for (const queryKey of [
        studioQueryKeys.workflow(workspace?.id),
        studioQueryKeys.artifacts(workspace?.id),
        studioQueryKeys.workspaces,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error) => {
      if (!shouldRetainIdempotencyKey(error)) {
        answerIntentKeyRef.current = null;
      }
    },
  });

  const approveRunMutation = useMutation({
    mutationFn: (runId: string) => api.decideRun(runId, "approve"),
    onSuccess: async () => {
      // Refresh the server projection before releasing the explicit run pointer.
      // Otherwise the URL keeps rendering the now-approved review until the user
      // manually revisits Today, even though the next workflow step is ready.
      await Promise.all(
        [
        studioQueryKeys.workflow(workspace?.id),
        studioQueryKeys.artifacts(workspace?.id),
        studioQueryKeys.run(resolvedRunId),
        studioQueryKeys.finalPosts(workspace?.id),
        studioQueryKeys.context(workspace?.id),
        studioQueryKeys.workspaces,
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      setActiveRunId(null);
    },
  });

  const rejectRunMutation = useMutation({
    mutationFn: (runId: string) => api.decideRun(runId, "reject"),
    onSuccess: () => {
      for (const queryKey of [
        studioQueryKeys.workflow(workspace?.id),
        studioQueryKeys.artifacts(workspace?.id),
        studioQueryKeys.run(resolvedRunId),
        studioQueryKeys.workspaces,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const reviseRunMutation = useMutation({
    mutationFn: async ({
      runId,
      expectedReviewRevision,
      instructions,
    }: {
      runId: string;
      expectedReviewRevision: number;
      instructions: string;
    }) => {
      setConflictMessage(null);
      const signature = JSON.stringify({
        runId,
        expectedReviewRevision,
        instructions,
      });
      const key =
        revisionIntentKeyRef.current?.signature === signature
          ? revisionIntentKeyRef.current.key
          : generateIdempotencyKey();
      revisionIntentKeyRef.current = { signature, key };
      return api.reviseRun(runId, {
        expectedReviewRevision,
        instructions,
        idempotencyKey: key,
      });
    },
    onSuccess: (data) => {
      revisionIntentKeyRef.current = null;
      setActiveRunId(data.id);
      for (const queryKey of [
        studioQueryKeys.workflow(workspace?.id),
        studioQueryKeys.artifacts(workspace?.id),
        studioQueryKeys.run(data.id),
        studioQueryKeys.context(workspace?.id),
        studioQueryKeys.workspaces,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error) => {
      if (!shouldRetainIdempotencyKey(error)) {
        revisionIntentKeyRef.current = null;
      }
      if (error instanceof ApiError && error.status === 409) {
        setConflictMessage(
          "A revision conflict occurred because the deliverable was updated by another session. We refreshed the latest state for you.",
        );
        void queryClient.invalidateQueries({
          queryKey: studioQueryKeys.run(resolvedRunId),
        });
        void queryClient.invalidateQueries({
          queryKey: studioQueryKeys.workflow(workspace?.id),
        });
      }
    },
  });

  const submitInterviewMutation = useMutation({
    mutationFn: async (input: {
      sessionId: string;
      expectedSessionVersion: number;
      questionId: string;
      questionVersion: number;
      optionSetId: string;
      selectedOptionIds: string[];
      customText?: string | undefined;
    }) => {
      if (!workspace?.id) throw new Error("Workspace required");
      const signature = JSON.stringify(input);
      const key =
        interviewIntentKeyRef.current?.signature === signature
          ? interviewIntentKeyRef.current.key
          : generateIdempotencyKey();
      interviewIntentKeyRef.current = { signature, key };

      return api.submitInterviewAnswer(workspace.id, {
        sessionId: input.sessionId,
        expectedSessionVersion: input.expectedSessionVersion,
        questionId: input.questionId,
        questionVersion: input.questionVersion,
        optionSetId: input.optionSetId,
        selectedOptionIds: input.selectedOptionIds,
        ...(input.customText !== undefined ? { customText: input.customText } : {}),
        idempotencyKey: key,
      });
    },
    onSuccess: () => {
      interviewIntentKeyRef.current = null;
      for (const queryKey of [
        studioQueryKeys.interview(workspace?.id),
        studioQueryKeys.workflow(workspace?.id),
        studioQueryKeys.workspaces,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error) => {
      if (!shouldRetainIdempotencyKey(error)) {
        interviewIntentKeyRef.current = null;
      }
      if (error instanceof ApiError && error.status === 409) {
        setConflictMessage(
          "An interview version conflict occurred because the briefing was updated in another session. We refreshed the latest state for you.",
        );
        void queryClient.invalidateQueries({
          queryKey: studioQueryKeys.interview(workspace?.id),
        });
      }
    },
  });

  const presentationState = useMemo(
    () =>
      selectTodayState({
        workspace,
        workflow: workflowQuery.data,
        activeRun: safeActiveRun,
        pendingQuestion: workflowQuery.data?.pendingQuestion ?? undefined,
        interview: interviewQuery.data,
        finalPosts: finalPostsQuery.data?.items,
        error: presentationError as Error | null,
      }),
    [
      workspace,
      workflowQuery.data,
      safeActiveRun,
      interviewQuery.data,
      finalPostsQuery.data,
      presentationError,
    ],
  );

  const mutationError =
    startInterviewMutation.error ??
    continueMutation.error ??
    answerQuestionMutation.error ??
    submitInterviewMutation.error ??
    approveRunMutation.error ??
    rejectRunMutation.error ??
    reviseRunMutation.error ??
    startContentCycleMutation.error;

  const actionError = conflictMessage
    ? null
    : actionErrorMessage(mutationError);

  async function onQuestionSubmit(answer: AnswerChoice): Promise<void> {
    const question = presentationState.payload?.question;
    if (!question) return;
    try {
      await answerQuestionMutation.mutateAsync({
        questionId: question.id,
        expectedVersion: question.version,
        answer,
      });
    } catch {
      // The mutation state supplies the user-facing error.
    }
  }

  async function onInterviewSubmit(input: {
    sessionId: string;
    expectedSessionVersion: number;
    questionId: string;
    questionVersion: number;
    optionSetId: string;
    selectedOptionIds: string[];
    customText?: string | undefined;
  }): Promise<void> {
    try {
      await submitInterviewMutation.mutateAsync(input);
    } catch {
      // Handled by mutation error state
    }
  }

  async function onApprove(): Promise<void> {
    const runId = presentationState.payload?.reviewRunId || resolvedRunId;
    if (!runId) return;
    try {
      await approveRunMutation.mutateAsync(runId);
    } catch {
      // The mutation state supplies the user-facing error.
    }
  }

  async function onRevise(feedback: string): Promise<void> {
    const runId = presentationState.payload?.reviewRunId || resolvedRunId;
    const revision = presentationState.payload?.reviewRevision || 1;
    if (!runId) return;
    try {
      await reviseRunMutation.mutateAsync({
        runId,
        expectedReviewRevision: revision,
        instructions: feedback,
      });
    } catch {
      // Conflict and mutation errors are handled above.
    }
  }

  async function onReject(): Promise<void> {
    const runId = presentationState.payload?.reviewRunId || resolvedRunId;
    if (!runId) return;
    try {
      await rejectRunMutation.mutateAsync(runId);
    } catch {
      // The mutation state supplies the user-facing error.
    }
  }

  async function onContinue(): Promise<void> {
    try {
      // The Phase 1 call-to-action begins the deterministic interview. Model
      // synthesis is deliberately a separate action after the interview has
      // completed, preventing an empty brand context from reaching the LLM.
      if (isPhase1 && !interviewQuery.data) {
        await startInterviewMutation.mutateAsync();
        return;
      }
      if (continueMutation.isPending || answerQuestionMutation.isPending ||
          workflowQuery.data?.activeRun ||
          (safeActiveRun && isRunActive(safeActiveRun.status))) return;
      await continueMutation.mutateAsync();
    } catch {
      // The mutation state supplies the user-facing error.
    }
  }

  async function onStartContentCycle(input: Parameters<TodayController["onStartContentCycle"]>[0]) {
    try {
      await startContentCycleMutation.mutateAsync(input);
    } catch {
      // The shared mutation error surface explains validation or state conflicts.
    }
  }

  return {
    actionError,
    conflictMessage,
    dismissConflict: () => setConflictMessage(null),
    isApproving: approveRunMutation.isPending,
    isContinuing:
      continueMutation.isPending || startInterviewMutation.isPending,
    isLoading: Boolean(
      workspace && workflowQuery.isLoading && !workflowQuery.data,
    ),
    isRejecting: rejectRunMutation.isPending,
    isRevising: reviseRunMutation.isPending,
    isSubmittingAnswer: answerQuestionMutation.isPending,
    isSubmittingInterview: submitInterviewMutation.isPending,
    isStartingContentCycle: startContentCycleMutation.isPending,
    onApprove,
    onContinue,
    onInterviewSubmit,
    onQuestionSubmit,
    onReject,
    onStartContentCycle,
    onRetrySync: () => {
      void workflowQuery.refetch();
      void activeRunQuery.refetch();
      void interviewQuery.refetch();
    },
    onRevise,
    presentationState,
    runProgressStage: runProgress?.runId === resolvedRunId
      ? runProgress.stage
      : null,
    userName,
  };
}
