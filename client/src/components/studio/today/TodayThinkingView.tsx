import { CircleCheck, LoaderCircle, Sparkles } from "lucide-react";
import type { Run } from "@/lib/contracts";

interface TodayThinkingViewProps {
  run?: Run | undefined;
  phaseNumber: number;
  progressStage?: string | null | undefined;
}

interface StageStep {
  id: string;
  label: string;
  status: "complete" | "active" | "pending";
}

function resolveStageSteps(
  stage: string | null | undefined,
  runStatus?: string,
): StageStep[] {
  const currentStage = stage ?? (runStatus === "queued" ? "queued" : "generating");

  switch (currentStage) {
    case "queued":
      return [
        {
          id: "queue",
          label: "Queued in orchestration pipeline",
          status: "active",
        },
        {
          id: "context",
          label: "Loading approved brand context & memory",
          status: "pending",
        },
        {
          id: "synthesis",
          label: "Synthesizing next reviewable version",
          status: "pending",
        },
      ];

    case "loading_context":
      return [
        {
          id: "queue",
          label: "Job claimed by active worker",
          status: "complete",
        },
        {
          id: "context",
          label: "Loading approved brand context & memory",
          status: "active",
        },
        {
          id: "synthesis",
          label: "Synthesizing platform deliverables",
          status: "pending",
        },
      ];

    case "generating":
      return [
        {
          id: "context",
          label: "Approved brand memory loaded",
          status: "complete",
        },
        {
          id: "synthesis",
          label: "Writing platform-native deliverables",
          status: "active",
        },
        {
          id: "validation",
          label: "Quality & brand compliance scan",
          status: "pending",
        },
      ];

    case "validating":
      return [
        {
          id: "synthesis",
          label: "Draft synthesis complete",
          status: "complete",
        },
        {
          id: "validation",
          label: "Running quality & compliance scan",
          status: "active",
        },
        {
          id: "review",
          label: "Preparing review workspace",
          status: "pending",
        },
      ];

    default:
      return [
        {
          id: "context",
          label: "Approved brand memory loaded",
          status: "complete",
        },
        {
          id: "answers",
          label: "Latest inputs and constraints saved",
          status: "complete",
        },
        {
          id: "synthesis",
          label: "Writing the next reviewable version",
          status: "active",
        },
      ];
  }
}

export function TodayThinkingView({
  run,
  phaseNumber,
  progressStage,
}: TodayThinkingViewProps) {
  const effectiveStage = progressStage ?? run?.progress_stage;
  const isQueued = run?.status === "queued" || effectiveStage === "queued";
  const steps = resolveStageSteps(effectiveStage, run?.status);

  return (
    <div
      aria-live="polite"
      className="px-1 pb-2 pt-2 text-center"
      role="status"
    >
      <span className="mx-auto mb-4 grid size-[70px] place-items-center rounded-3xl bg-acid-400/10 text-acid-400">
        <Sparkles aria-hidden="true" className="size-6" />
      </span>
      <h3 className="text-lg font-medium text-white">
        {isQueued ? "Getting your work ready" : "Your manager is working"}
      </h3>
      <p className="mt-1 text-[11px] leading-5 text-white/45">
        Phase {phaseNumber} is active. You can safely leave this page.
      </p>
      <div className="relative mx-auto mt-[18px] h-[7px] max-w-[420px] overflow-hidden rounded-full bg-white/[.06]">
        <div
          aria-hidden="true"
          className="indeterminate-progress absolute inset-y-0 w-1/3 rounded-full bg-acid-400"
        />
      </div>
      <p className="mt-2 text-[10px] text-white/40">
        Preparing the next reviewable result
      </p>
      <div className="mx-auto mt-[18px] grid w-full max-w-[440px] gap-2 text-left text-[10px]">
        {steps.map((step) => {
          if (step.status === "complete") {
            return (
              <span
                className="flex items-center gap-2 text-acid-400"
                key={step.id}
              >
                <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
                <span>{step.label}</span>
              </span>
            );
          }
          if (step.status === "active") {
            return (
              <span
                className="flex items-center gap-2 text-white/80 font-medium"
                key={step.id}
              >
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 shrink-0 animate-spin text-acid-400"
                />
                <span>{step.label}</span>
              </span>
            );
          }
          return (
            <span
              className="flex items-center gap-2 text-white/30"
              key={step.id}
            >
              <span
                aria-hidden="true"
                className="size-4 shrink-0 rounded-full border border-white/20"
              />
              <span>{step.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
