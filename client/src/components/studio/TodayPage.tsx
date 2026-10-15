import { AlertTriangle, ArrowRight, RefreshCw, RotateCcw } from "lucide-react";
import { TodaySkeleton } from "@/components/ui/Skeletons";
import type { Workspace } from "@/lib/contracts";
import type { TodayPresentationState } from "@/lib/today-selector";
import { CreateWorkspace } from "./CreateWorkspace";
import { TodayActivityFeed } from "./today/TodayActivityFeed";
import { TodayCalendarView } from "./today/TodayCalendarView";
import { TodayCoachRail } from "./today/TodayCoachRail";
import { TodayInterviewView } from "./today/TodayInterviewView";
import { TodayMissionCard } from "./today/TodayMissionCard";
import { TodayPostsView } from "./today/TodayPostsView";
import { TodayProductionView } from "./today/TodayProductionView";
import { TodayQcView } from "./today/TodayQcView";
import { TodayQuestionView } from "./today/TodayQuestionView";
import { TodayReviewView } from "./today/TodayReviewView";
import { TodayThinkingView } from "./today/TodayThinkingView";
import {
  useTodayController,
  type TodayController,
} from "./today/useTodayController";

export interface TodayPageProps {
  workspace?: Workspace | undefined;
}

function getGreeting(name?: string | null, timeZone = "UTC"): string {
  let hour: number;
  try {
    const hourPart = new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone,
    })
      .formatToParts(new Date())
      .find((part) => part.type === "hour")?.value;
    hour = Number(hourPart ?? 0);
  } catch {
    hour = new Date().getUTCHours();
  }

  const timeOfDay =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  if (!name) return timeOfDay;
  return `${timeOfDay}, ${name.trim().split(" ")[0]}`;
}

function ContinueButton({
  isPending,
  label,
  onContinue,
}: {
  isPending: boolean;
  label: string;
  onContinue: () => Promise<void>;
}) {
  return (
    <button
      className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] bg-acid-400 px-3.5 text-[11px] font-semibold text-ink-950 transition-colors hover:bg-white disabled:opacity-60"
      disabled={isPending}
      onClick={() => void onContinue()}
      type="button"
    >
      {isPending ? (
        <RefreshCw aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <ArrowRight aria-hidden="true" className="size-4" />
      )}
      <span>{label}</span>
    </button>
  );
}

function TodayMissionContent({
  controller,
  state,
  workspace,
}: {
  controller: TodayController;
  state: TodayPresentationState;
  workspace?: Workspace | undefined;
}) {
  if (state.kind === "needs_workspace") {
    return (
      <div className="py-2">
        <CreateWorkspace />
      </div>
    );
  }

  if (state.kind === "welcome") {
    return (
      <div>
        <div className="grid">
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-white/10 py-2.5 max-[440px]:grid-cols-1 max-[440px]:gap-1"><span className="text-[10px] text-white/40">I need from you</span><strong className="text-[11px] font-medium leading-[1.45] text-white/85">What you do, who it helps, and the result you offer</strong></div>
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-white/10 py-2.5 max-[440px]:grid-cols-1 max-[440px]:gap-1"><span className="text-[10px] text-white/40">I will create</span><strong className="text-[11px] font-medium leading-[1.45] text-white/85">Brand voice, audience blueprint and positioning</strong></div>
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2.5 max-[440px]:grid-cols-1 max-[440px]:gap-1"><span className="text-[10px] text-white/40">You stay in control</span><strong className="text-[11px] font-medium leading-[1.45] text-white/85">Nothing becomes official until you approve it</strong></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-white/40">You can pause and continue later.</span><ContinueButton isPending={controller.isContinuing} label={state.actions[0]?.label ?? "Start with one question"} onContinue={controller.onContinue} /></div>
      </div>
    );
  }

  const interview = state.payload?.interview;
  if (
    state.kind === "interview" &&
    interview &&
    interview.authority === "guided" &&
    interview.currentQuestion &&
    workspace
  ) {
    return (
      <TodayInterviewView
        key={`${interview.session.id}:${interview.currentQuestion.id}:${interview.currentQuestion.activeOptionSet.id}`}
        isSubmitting={controller.isSubmittingInterview}
        onSubmit={controller.onInterviewSubmit}
        progress={interview.progress}
        question={interview.currentQuestion}
        sessionId={interview.session.id}
        sessionVersion={interview.session.version}
        workspaceId={workspace.id}
      />
    );
  }

  if (state.kind === "question" && state.payload?.question) {
    return (
      <TodayQuestionView
        key={state.payload.question.id}
        isSubmitting={controller.isSubmittingAnswer}
        onSubmit={controller.onQuestionSubmit}
        question={state.payload.question}
      />
    );
  }

  if (state.kind === "thinking") {
    return (
      <TodayThinkingView
        phaseNumber={state.phaseNumber}
        progressStage={controller.runProgressStage}
        run={state.payload?.activeRun}
      />
    );
  }

  const reviewProps = {
    isApproving: controller.isApproving,
    isRejecting: controller.isRejecting,
    isRevising: controller.isRevising,
    markdownFallback: state.payload?.markdownFallback,
    onApprove: controller.onApprove,
    onReject: controller.onReject,
    onRevise: controller.onRevise,
  };

  if (state.kind === "review") {
    return (
      <TodayReviewView
        {...reviewProps}
        brandFoundation={state.payload?.brandFoundation}
      />
    );
  }

  if (state.kind === "calendar") {
    return (
      <TodayCalendarView
        {...reviewProps}
        calendar={state.payload?.calendar}
      />
    );
  }

  if (state.kind === "qc") {
    return (
      <TodayQcView
        {...reviewProps}
        qcScorecard={state.payload?.qcScorecard}
      />
    );
  }

  if (state.kind === "production") {
    return (
      <TodayProductionView
        isGenerating={controller.isContinuing}
        onGenerate={controller.onContinue}
        plan={state.payload?.productionPlan}
      />
    );
  }

  if (state.kind === "posts" && state.payload?.posts) {
    return (
      <TodayPostsView
        isStartingContentCycle={controller.isStartingContentCycle}
        onStartContentCycle={controller.onStartContentCycle}
        posts={state.payload.posts}
      />
    );
  }

  if (state.kind === "cycle_complete") {
    return (
      <ContinueButton
        isPending={controller.isContinuing}
        label={`Start Cycle ${(state.payload?.cycle ?? 1) + 1} strategy`}
        onContinue={controller.onContinue}
      />
    );
  }

  if (state.kind === "approved") {
    return (
      <div>
        <div className="mb-3.5 rounded-[13px] bg-acid-400/10 p-3.5 text-acid-400"><strong className="block text-[11px] font-medium">Approved and saved</strong><span className="mt-0.5 block text-[9px] leading-4">The result is now part of your approved workspace context and Library.</span></div>
        <div className="flex justify-end"><ContinueButton isPending={controller.isContinuing} label={`Advance to Phase ${Math.min(state.phaseNumber + 1, 6)}`} onContinue={controller.onContinue} /></div>
      </div>
    );
  }

  if (state.kind === "error") {
    const failedRun = state.payload?.activeRun?.status === "failed" ||
      state.payload?.activeRun?.status === "dead";
    return (
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-acid-400 px-5 py-2.5 text-sm font-bold text-ink-950 shadow-md transition-colors hover:bg-acid-300"
        onClick={() => {
          if (failedRun) {
            void controller.onContinue();
            return;
          }
          controller.onRetrySync();
        }}
        type="button"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        <span>{state.actions[0]?.label ?? "Retry sync"}</span>
      </button>
    );
  }

  return null;
}

export function TodayPage({ workspace }: TodayPageProps) {
  const controller = useTodayController(workspace);
  const state = controller.presentationState;

  if (controller.isLoading) {
    return (
      <>
        <h1 className="sr-only">Today</h1>
        <TodaySkeleton />
      </>
    );
  }

  return (
    <div>
      {!workspace ? <h1 className="sr-only">Today</h1> : null}
      {workspace ? (
        <section
          aria-label="Daily briefing overview"
          className="mb-[18px] flex items-start justify-between gap-5 max-[440px]:block"
        >
          <div>
            <h1 className="text-2xl font-medium leading-tight text-white">
              {getGreeting(controller.userName, workspace.timezone)}
            </h1>
            <p className="mt-1 text-xs leading-5 text-white/48">
              {state.subheading}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-acid-400/10 px-2.5 py-1.5 text-[10px] text-acid-400 max-[440px]:mt-2">
            <span aria-hidden className={`size-1.5 rounded-full bg-current ${state.statusBadge.pulse ? "animate-pulse" : ""}`} />
            {state.statusBadge.text}
          </span>
        </section>
      ) : null}

      {controller.conflictMessage ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-coral-400/30 bg-coral-400/10 p-4 text-sm text-coral-400"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-coral-400"
          />
          <div className="flex-1">
            <p className="font-semibold">Revision Conflict</p>
            <p className="mt-0.5 text-xs text-white/70">
              {controller.conflictMessage}
            </p>
          </div>
          <button
            className="min-h-11 px-2 text-xs font-semibold text-coral-400 hover:text-white"
            onClick={controller.dismissConflict}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {controller.actionError ? (
        <div
          className="rounded-xl border border-coral-400/30 bg-coral-400/10 p-4 text-sm text-white/80"
          role="alert"
        >
          <p className="font-semibold text-coral-400">Action not completed</p>
          <p className="mt-1 text-xs leading-5">{controller.actionError}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3.5 min-[720px]:grid-cols-[minmax(0,1fr)_235px]">
        <div>
          <TodayMissionCard
            heading={state.heading}
            kicker={state.kicker}
            statusBadge={state.statusBadge}
            subheading={state.subheading}
          >
            <TodayMissionContent
              controller={controller}
              state={state}
              workspace={workspace}
            />
          </TodayMissionCard>
          <TodayActivityFeed className="mt-3.5" items={state.timeline} />
        </div>

        <TodayCoachRail state={state} workspace={workspace} />
      </div>
    </div>
  );
}
