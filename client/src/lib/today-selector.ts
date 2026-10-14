import { getPhaseConfig } from "@/config/phases";
import { PRODUCT_CONFIG } from "@/config/product";
import type {
  BrandFoundationPresentation,
  ContentCalendarPresentation,
  FinalPost,
  InterviewState,
  PendingQuestion,
  PostBatchPresentation,
  QcScorecardPresentation,
  Run,
  WorkflowState,
  Workspace,
} from "./contracts";
import {
  brandFoundationPresentationSchema,
  contentCalendarPresentationSchema,
  qcScorecardPresentationSchema,
} from "./contracts";

export type TodayMomentKind =
  | "needs_workspace"
  | "welcome"
  | "question"
  | "interview"
  | "thinking"
  | "review"
  | "approved"
  | "calendar"
  | "production"
  | "qc"
  | "posts"
  | "cycle_complete"
  | "error";

export interface TodayTimelineItem {
  icon: string;
  title: string;
  description: string;
  time: string;
}

export interface TodayActionItem {
  action:
    | "continue"
    | "answer"
    | "approve"
    | "revise"
    | "reject"
    | "create_workspace"
    | "retry"
    | "copy_post";
  label: string;
  variant: "primary" | "secondary" | "ghost" | "destructive" | "success";
  icon?: string | undefined;
  loading?: boolean | undefined;
}

export interface TodayPayload {
  question?: PendingQuestion | undefined;
  interview?: InterviewState | undefined;
  brandFoundation?: BrandFoundationPresentation | undefined;
  calendar?: ContentCalendarPresentation | undefined;
  production?: PostBatchPresentation | undefined;
  productionPlan?: WorkflowState["contentPlan"] | undefined;
  qcScorecard?: QcScorecardPresentation | undefined;
  posts?: FinalPost[] | undefined;
  activeRun?: Run | undefined;
  reviewRunId?: string | undefined;
  reviewRevision?: number | undefined;
  markdownFallback?: string | undefined;
  errorMessage?: string | undefined;
  cycle?: number | undefined;
}

export interface TodayPresentationState {
  kind: TodayMomentKind;
  phaseNumber: number;
  phaseLabel: string;
  kicker: string;
  heading: string;
  subheading: string;
  statusBadge: {
    text: string;
    icon: string;
    pulse?: boolean | undefined;
    timeLabel?: string | undefined;
  };
  timeline: TodayTimelineItem[];
  actions: TodayActionItem[];
  payload?: TodayPayload | undefined;
}

export interface SelectTodayStateOptions {
  workspace?: Workspace | undefined;
  workflow?: WorkflowState | undefined;
  activeRun?: Run | undefined;
  pendingQuestion?: PendingQuestion | undefined;
  interview?: InterviewState | null | undefined;
  finalPosts?: FinalPost[] | undefined;
  error?: Error | null | undefined;
}

function parseStructuredPayload<T>(
  data: unknown,
  schema: { safeParse: (val: unknown) => { success: boolean; data?: T } },
): T | undefined {
  if (!data) return undefined;
  let candidate = data;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      // Not a JSON string
    }
  }
  const parsed = schema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Checks whether a run is awaiting human review/approval according to the real backend contract.
 * Backwards-compatible with legacy review_pending state.
 */
export function isRunAwaitingApproval(run?: Run | undefined): boolean {
  if (!run) return false;
  return (
    ((run.status === "waiting_approval" || run.status === "completed") &&
      run.output_status === "pending") ||
    // Legacy waiting-approval rows predate output_status. Keep them visible
    // while requiring explicit pending status for completed step outputs.
    (run.status === "waiting_approval" && !run.output_status) ||
    run.status === "review_pending"
  );
}

function reviewableArtifactContent(artifact: unknown): unknown {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return artifact;
  }
  const content = (artifact as { content?: unknown }).content;
  return typeof content === "string" ? content : artifact;
}

/**
 * Deterministically computes the Today presentation state from backend facts.
 * Fails closed to safe, informative states without inventing fake counts, timers, or internal names.
 */
export function selectTodayState(
  options: SelectTodayStateOptions,
): TodayPresentationState {
  const {
    workspace,
    workflow,
    activeRun,
    pendingQuestion,
    interview,
    finalPosts,
    error,
  } = options;

  if (error) {
    return {
      kind: "error",
      phaseNumber: workspace?.current_phase ?? 1,
      phaseLabel: "Workflow paused",
      kicker: "Connection interrupted",
      heading: "We couldn’t reach your autopilot orchestrator.",
      subheading:
        error.message ||
        "A network or service disruption occurred. Check your connection and retry.",
      statusBadge: {
        text: "Error encountered",
        icon: "alert-triangle",
        pulse: false,
      },
      timeline: [],
      actions: [
        {
          action: "retry",
          label: "Retry connection",
          variant: "primary",
          icon: "rotate-cw",
        },
      ],
      payload: { errorMessage: error.message },
    };
  }

  if (!workspace) {
    return {
      kind: "needs_workspace",
      phaseNumber: 1,
      phaseLabel: "Get started",
      kicker: `Welcome to ${PRODUCT_CONFIG.name}`,
      heading: "Give your brand a dedicated workspace.",
      subheading:
        "Your brand context will become the source of truth for strategy, creative drafts, and scheduled posts.",
      statusBadge: { text: "Setup needed", icon: "sparkles", pulse: false },
      timeline: [
        {
          icon: "sparkles",
          title: "Autonomous studio ready",
          description: "Initialize your first brand workspace",
          time: "Now",
        },
      ],
      actions: [
        {
          action: "create_workspace",
          label: "Create workspace",
          variant: "primary",
          icon: "plus",
        },
      ],
    };
  }

  const phaseNumber = workflow?.phase ?? workspace.current_phase ?? 1;

  // 1. Question Pending Moment: highest priority when a question is actively blocking progress
  const question =
    pendingQuestion ??
    workflow?.pendingQuestion ??
    (workflow as { pending_question?: PendingQuestion } | undefined)
      ?.pending_question;
  if (question && question.status === "pending") {
    const questionText =
      question.prompt ||
      (question as { question_text?: string }).question_text ||
      "";
    return {
      kind: "question",
      phaseNumber,
      phaseLabel: getPhaseConfig(phaseNumber).label,
      kicker: `Phase ${phaseNumber} · Decision needed`,
      heading: questionText,
      subheading: question.purpose || "",
      statusBadge: {
        text: "Question pending",
        icon: "message-circle-question",
        pulse: true,
      },
      timeline: [
        {
          icon: "message-circle-question",
          title: "Targeted question generated",
          description: questionText,
          time: "Now",
        },
      ],
      actions: [
        {
          action: "answer",
          label: "Submit answer",
          variant: "primary",
          icon: "arrow-right",
        },
      ],
      payload: { question },
    };
  }

  // A terminal run failure must remain visible. Falling through to the ready
  // state makes a failed background job look as though nothing happened and
  // leaves non-technical users unsure whether it is safe to try again.
  if (activeRun?.status === "failed" || activeRun?.status === "dead") {
    return {
      kind: "error",
      phaseNumber,
      phaseLabel: "Workflow paused",
      kicker: `Phase ${phaseNumber} · Needs another try`,
      heading: "I couldn’t finish that step.",
      subheading:
        "Your workspace and saved answers are safe. Try the step again and I’ll continue from the same point.",
      statusBadge: {
        text: "Step paused",
        icon: "alert-triangle",
        pulse: false,
      },
      timeline: [
        {
          icon: "alert-triangle",
          title: "This attempt stopped",
          description: "No approved work was overwritten",
          time: "Now",
        },
      ],
      actions: [
        {
          action: "retry",
          label: "Try this step again",
          variant: "primary",
          icon: "rotate-cw",
        },
      ],
      payload: {
        activeRun,
        errorMessage: activeRun.error_message ?? "The orchestration attempt failed.",
      },
    };
  }

  // 2. Thinking / Agent Working Moment: run is actively executing or queued
  if (
    activeRun &&
    (activeRun.status === "running" || activeRun.status === "queued")
  ) {
    const friendlyPhase = getPhaseConfig(phaseNumber).label;
    return {
      kind: "thinking",
      phaseNumber,
      phaseLabel: "Agent working",
      kicker: `Phase ${phaseNumber} · Autopilot active`,
      heading:
        phaseNumber === 1
          ? "Synthesizing your brand foundation..."
          : phaseNumber === 2
            ? "Structuring your monthly content calendar..."
            : phaseNumber === 4
              ? "Running quality control & brand compliance scan..."
              : phaseNumber === 6
                ? "Synthesizing performance signals & audience feedback..."
                : "Drafting platform-native deliverables...",
      subheading:
        "Analyzing your inputs, positioning angles, and performance constraints. Review will unlock automatically when finished.",
      statusBadge: {
        text:
          activeRun.status === "queued"
            ? "Queued in pipeline"
            : "Researching & writing",
        icon: "brain-circuit",
        pulse: true,
      },
      timeline: [
        {
          icon: "brain-circuit",
          title: `${PRODUCT_CONFIG.shortName} active`,
          description: `Executing Phase ${phaseNumber}: ${friendlyPhase}`,
          time: "In progress",
        },
      ],
      actions: [],
      payload: { activeRun },
    };
  }

  // 3. Review Pending Moment: run output awaiting user decision
  if (activeRun && isRunAwaitingApproval(activeRun)) {
    const reviewPhase = activeRun.phase;
    const rawOutput =
      reviewableArtifactContent(activeRun.output?.artifacts?.[0]) ??
      activeRun.artifacts?.[0]?.content ??
      (activeRun as { output_data?: unknown }).output_data ??
      activeRun.output?.message;
    const brandFoundation = parseStructuredPayload(
      rawOutput,
      brandFoundationPresentationSchema,
    );
    const calendar = parseStructuredPayload(
      rawOutput,
      contentCalendarPresentationSchema,
    );
    const qcScorecard = parseStructuredPayload(
      rawOutput,
      qcScorecardPresentationSchema,
    );

    // If Phase 4 Quality Control review
    if (qcScorecard || reviewPhase === 4) {
      return {
        kind: "qc",
        phaseNumber: 4,
        phaseLabel: getPhaseConfig(4).label,
        kicker: "Phase 4 · Quality review",
        heading: "Your content quality & compliance scorecard is ready.",
        subheading:
          "Review automated compliance scores, formatting validations, and brand voice rules before distribution.",
        statusBadge: {
          text: "Quality review",
          icon: "shield-check",
          pulse: false,
        },
        timeline: [
          {
            icon: "shield-check",
            title: "Quality scorecard compiled",
            description: qcScorecard
              ? `${qcScorecard.passedCount} checks passed · ${qcScorecard.failedCount} warnings`
              : "Detailed review ready",
            time: "Now",
          },
        ],
        actions: [
          {
            action: "approve",
            label: "Approve scorecard & continue",
            variant: "primary",
            icon: "check",
          },
          {
            action: "revise",
            label: "Ask for changes",
            variant: "secondary",
            icon: "message-square-text",
          },
          {
            action: "reject",
            label: "Reject draft",
            variant: "destructive",
            icon: "x",
          },
        ],
        payload: {
          qcScorecard,
          activeRun,
          reviewRunId: activeRun.id,
          reviewRevision: activeRun.review_revision ?? 1,
          markdownFallback:
            typeof rawOutput === "string" ? rawOutput : undefined,
        },
      };
    }

    // If Phase 2 calendar review
    if (calendar || reviewPhase === 2) {
      return {
        kind: "calendar",
        phaseNumber: 2,
        phaseLabel: getPhaseConfig(2).label,
        kicker: "Phase 2 · Review deliverable",
        heading:
          "Your monthly strategic content calendar is ready for review.",
        subheading:
          "Review platform allocations, themes, and publishing cadence. Approve to begin batch post production.",
        statusBadge: {
          text: "Review required",
          icon: "clipboard-check",
          pulse: false,
        },
        timeline: [
          {
            icon: "calendar-days",
            title: "Content calendar draft compiled",
            description: "Scheduled angles and themes ready",
            time: "Now",
          },
        ],
        actions: [
          {
            action: "approve",
            label: "Approve calendar & continue",
            variant: "primary",
            icon: "check",
          },
          {
            action: "revise",
            label: "Ask for changes",
            variant: "secondary",
            icon: "message-square-text",
          },
          {
            action: "reject",
            label: "Reject draft",
            variant: "destructive",
            icon: "x",
          },
        ],
        payload: {
          calendar,
          activeRun,
          reviewRunId: activeRun.id,
          reviewRevision: activeRun.review_revision ?? 1,
          markdownFallback:
            typeof rawOutput === "string" ? rawOutput : undefined,
        },
      };
    }

    const isBrandReview = reviewPhase === 1;
    const reviewPhaseConfig = getPhaseConfig(reviewPhase);
    return {
      kind: "review",
      phaseNumber: reviewPhase,
      phaseLabel: reviewPhaseConfig.label,
      kicker: `Phase ${reviewPhase} · Review deliverable`,
      heading: isBrandReview
        ? "Your brand foundation is ready for review."
        : `Your ${reviewPhaseConfig.label.toLowerCase()} result is ready for review.`,
      subheading: isBrandReview
        ? "Verify your brand pillars, audience personas, and positioning angles before advancing to monthly strategy."
        : "Review the generated result. Approve it, reject it, or describe exactly what should change.",
      statusBadge: {
        text: "Review required",
        icon: "clipboard-check",
        pulse: false,
      },
      timeline: [
        {
          icon: "clipboard-check",
          title: isBrandReview
            ? "Brand foundation compiled"
            : `${reviewPhaseConfig.label} result ready`,
          description: isBrandReview
            ? "Pillars, voice rules, and positioning ready"
            : "Waiting for your decision",
          time: "Now",
        },
      ],
      actions: [
        {
          action: "approve",
          label: "Approve & continue",
          variant: "primary",
          icon: "check",
        },
        {
          action: "revise",
          label: "Ask for changes",
          variant: "secondary",
          icon: "message-square-text",
        },
        {
          action: "reject",
          label: "Reject draft",
          variant: "destructive",
          icon: "x",
        },
      ],
      payload: {
        brandFoundation,
        activeRun,
        reviewRunId: activeRun.id,
        reviewRevision: activeRun.review_revision ?? 1,
        markdownFallback:
          typeof rawOutput === "string" ? rawOutput : undefined,
      },
    };
  }

  // 4. A completed Phase 6 closes only the current cycle; it is never a
  // terminal product state. Merely entering Phase 6 is not completion.
  const isPhase6OrTerminalCycle =
    workflow?.phase === 6 &&
      (workflow.phaseStatus === "completed" ||
        workflow.workflowStatus === "completed" ||
        (activeRun?.phase === 6 &&
          (activeRun.status === "approved" || activeRun.status === "completed")));

  if (isPhase6OrTerminalCycle) {
    const currentCycle = workflow?.cycle ?? 1;
    const nextCycle = currentCycle + 1;
    return {
      kind: "cycle_complete",
      phaseNumber: 6,
      phaseLabel: getPhaseConfig(6).label,
      kicker: "Phase 6 · Continuous improvement",
      heading: `Cycle ${currentCycle} complete. Ready for Cycle ${nextCycle} strategy.`,
      subheading:
        "Your manager is ready to use this cycle’s approved work when planning the next one.",
      statusBadge: {
        text: `Cycle ${currentCycle} complete`,
        icon: "refresh-cw",
        pulse: false,
      },
      timeline: [
        {
          icon: "refresh-cw",
          title: `Cycle ${currentCycle} complete`,
          description: "Next planning cycle is ready",
          time: "Now",
        },
      ],
      actions: [
        {
          action: "continue",
          label: `Start Cycle ${nextCycle} strategy`,
          variant: "primary",
          icon: "arrow-right",
        },
      ],
      payload: { cycle: currentCycle },
    };
  }

  // 5. Show the approval transition only while the workflow still points at
  // that run's phase. Once the backend advances, the new phase owns the UI.
  if (
    activeRun?.status === "approved" &&
    (!workflow || workflow.phase === activeRun.phase)
  ) {
    const nextPhase = Math.min(phaseNumber + 1, 6);
    return {
      kind: "approved",
      phaseNumber,
      phaseLabel: "Phase approved",
      kicker: `Phase ${phaseNumber} complete`,
      heading: `Ready to advance to Phase ${nextPhase}: ${getPhaseConfig(nextPhase).label}.`,
      subheading:
        "Your approval was saved. Your manager is ready for the next backend-selected step.",
      statusBadge: { text: "Approved", icon: "badge-check", pulse: false },
      timeline: [
        {
          icon: "badge-check",
          title: `Phase ${phaseNumber} approved`,
          description: "Your decision was saved",
          time: "Just now",
        },
      ],
      actions: [
        {
          action: "continue",
          label: `Start Phase ${nextPhase}`,
          variant: "primary",
          icon: "arrow-right",
        },
      ],
    };
  }

  // 6. Final posts are a Phase 5 delivery moment. Restricting this projection
  // prevents retained posts from an older cycle from hiding the current phase.
  if (phaseNumber === 5 && finalPosts && finalPosts.length > 0) {
    return {
      kind: "posts",
      phaseNumber,
      phaseLabel: getPhaseConfig(phaseNumber).label,
      kicker: "Approved deliverables",
      heading: "Your latest platform-native posts are ready to publish.",
      subheading:
        "Copy a post here, or open Library for the complete week, day, and platform view.",
      statusBadge: { text: "Ready to publish", icon: "send", pulse: false },
      timeline: [
        {
          icon: "send",
          title: "Latest deliverables ready",
          description: `${finalPosts.length} shown in this view`,
          time: "Now",
        },
      ],
      actions: [
        {
          action: "copy_post",
          label: "Copy post",
          variant: "primary",
          icon: "copy",
        },
      ],
      payload: { posts: finalPosts },
    };
  }

  // 7. Production Moment: Phase 3 active without pending review or final posts yet
  if (phaseNumber === 3) {
    const drafted = workflow?.contentPlan?.drafted ?? 0;
    const total = workflow?.contentPlan?.total ?? 0;
    return {
      kind: "production",
      phaseNumber: 3,
      phaseLabel: getPhaseConfig(3).label,
      kicker: "Phase 3 · Production",
      heading: drafted > 0 ? `${drafted} of ${total} posts drafted.` : "Ready to draft your scheduled posts.",
      subheading:
        `${PRODUCT_CONFIG.shortName} works through the approved calendar in small batches. Your completed drafts are saved as it goes.`,
      statusBadge: {
        text: total > 0 ? `${drafted} / ${total} drafted` : "Ready for production",
        icon: "wand-sparkles",
        pulse: false,
      },
      timeline: [
        {
          icon: "wand-sparkles",
          title: "Strategy ready for production",
          description: total > 0 ? `${total - drafted} scheduled posts remaining` : "Approved calendar ready",
          time: "Now",
        },
      ],
      actions: [
        {
          action: "continue",
          label: drafted > 0 ? "Continue drafting posts" : "Start drafting posts",
          variant: "primary",
          icon: "wand-sparkles",
        },
      ],
      payload: { productionPlan: workflow?.contentPlan },
    };
  }

  // 7b. Guided Interview Moment: Phase 1 onboarding when guided intake is in progress
  if (
    phaseNumber === 1 &&
    interview &&
    interview.authority === "guided" &&
    interview.session.status === "in_progress" &&
    interview.currentQuestion
  ) {
    const q = interview.currentQuestion;
    const currentIdx = interview.progress?.currentIndex ?? 1;
    const totalQ = interview.progress?.totalQuestions ?? 5;
    return {
      kind: "interview",
      phaseNumber: 1,
      phaseLabel: getPhaseConfig(1).label,
      kicker: `Phase 1 · Question ${currentIdx} of ${totalQ}`,
      heading: q.prompt,
      subheading: q.supportingText,
      statusBadge: {
        text: `Briefing ${currentIdx}/${totalQ}`,
        icon: "message-circle-question",
        pulse: true,
      },
      timeline: [
        {
          icon: "message-circle-question",
          title: `Question ${currentIdx} of ${totalQ}`,
          description: q.prompt,
          time: "Now",
        },
      ],
      actions: [
        {
          action: "answer",
          label: "Use this answer",
          variant: "primary",
          icon: "arrow-right",
        },
      ],
      payload: { interview },
    };
  }

  // 8. Ready state. Phase 1 keeps the first-visit orientation; later phases
  // state the current mission without letting the browser select its skill.
  const phase = getPhaseConfig(phaseNumber);
  const isInterviewComplete =
    interview &&
    interview.authority === "guided" &&
    interview.session.status === "completed";

  const readyCopy: Record<number, { heading: string; subheading: string; action: string }> = {
    1: {
      heading: isInterviewComplete
        ? `Briefing complete for ${workspace.name}.`
        : `Let’s teach me the basics about ${workspace.name}.`,
      subheading: isInterviewComplete
        ? `Your inputs are saved. ${PRODUCT_CONFIG.shortName} is ready to research, organize, and compile your brand foundation.`
        : "You answer. I research, organize, write and save the useful parts for every future post.",
      action: isInterviewComplete
        ? "Synthesize brand foundation"
        : "Start with one question",
    },
    2: {
      heading: "Ready to plan your next content cycle.",
      subheading: phase.shortDescription,
      action: "Start planning",
    },
    3: {
      heading: "Ready to create your next content batch.",
      subheading: phase.shortDescription,
      action: "Start creating",
    },
    4: {
      heading: "Ready to check quality before anything moves forward.",
      subheading: phase.shortDescription,
      action: "Start quality review",
    },
    5: {
      heading: "Ready to extend your best ideas across channels.",
      subheading: phase.shortDescription,
      action: "Start repurposing",
    },
    6: {
      heading: "Ready to learn from this cycle.",
      subheading: phase.shortDescription,
      action: "Review performance",
    },
  };
  const ready = readyCopy[phaseNumber] ?? {
    heading: `Ready for ${phase.label}.`,
    subheading: phase.shortDescription,
    action: "Continue",
  };

  return {
    kind: "welcome",
    phaseNumber,
    phaseLabel: phase.label,
    kicker:
      phaseNumber === 1
        ? "Meet your autopilot manager"
        : `Phase ${phaseNumber} · ${phase.supportingLabel}`,
    heading: ready.heading,
    subheading: ready.subheading,
    statusBadge: { text: "Ready when you are", icon: "flag", pulse: false },
    timeline: [
      {
        icon: "message-circle",
        title: phaseNumber === 1 ? "Workspace ready" : `${phase.label} is ready`,
        description: phase.shortDescription,
        time: "Now",
      },
    ],
    actions: [
      {
        action: "continue",
        label: ready.action,
        variant: "primary",
        icon: "arrow-right",
      },
    ],
  };
}
