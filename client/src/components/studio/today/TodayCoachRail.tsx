import { Archive, Check } from "lucide-react";
import { getPhaseConfig } from "@/config/phases";
import type { Workspace } from "@/lib/contracts";
import type { TodayPresentationState } from "@/lib/today-selector";
import { PRODUCT_CONFIG } from "@/config/product";

export interface TodayCoachRailProps {
  state: TodayPresentationState;
  workspace?: Workspace | undefined;
}

const STEP_LABELS: Record<number, readonly [string, string, string, string]> = {
  1: ["Basics", "Brand personality", "Audience", "Review"],
  2: ["Goal", "Content mix", "Calendar", "Review"],
  3: ["Inputs", "Platform drafts", "Batch review", "Delivery"],
  4: ["Voice", "Quality", "Compliance", "Approval"],
  5: ["Core post", "Adaptations", "Queue", "Delivery"],
  6: ["Signals", "Patterns", "Learnings", "Next cycle"],
};

const REVIEW_MOMENTS = new Set(["review", "calendar", "qc", "posts", "approved", "cycle_complete"]);

function progressIndexFor(state: TodayPresentationState): number {
  if (REVIEW_MOMENTS.has(state.kind)) return 3;

  // A question or failed attempt is still inside the current task. Treating
  // every non-loading moment as "Review" falsely showed 100% after an early
  // onboarding failure.
  if (state.kind === "welcome" || state.kind === "question" || state.kind === "error") {
    return 0;
  }

  if (state.kind === "thinking") {
    // The first onboarding skill is still gathering Basics while the model is
    // working; loading alone must not advance the visible milestone.
    if (state.payload?.activeRun?.skill_name === "social-media-context-sms") return 0;
    return 1;
  }
  if (state.kind === "production") return 1;
  return 0;
}

/** Desktop-only context rail copied from Variant B's three compact coach cards. */
export function TodayCoachRail({ state, workspace }: TodayCoachRailProps) {
  const phase = getPhaseConfig(state.phaseNumber);
  const labels = STEP_LABELS[state.phaseNumber] ?? STEP_LABELS[1]!;
  const progressIndex = progressIndexFor(state);

  return (
    <aside aria-label={`${PRODUCT_CONFIG.shortName} coach rail`} className="hidden w-[235px] shrink-0 gap-2.5 min-[720px]:grid">
      <section className="rounded-[15px] border border-white/[.08] bg-white/[.035] p-3.5">
        <div className="mb-2 flex items-center justify-between text-[9px] text-white/40"><span>NOW</span><span>Phase {state.phaseNumber} of 6</span></div>
        <strong className="block text-[11px] font-medium text-white">{phase.label}</strong>
        <p className="mt-1 text-[10px] leading-4 text-white/45">{phase.shortDescription}</p>
      </section>

      <section className="rounded-[15px] border border-white/[.08] bg-white/[.035] p-3.5">
        <div className="mb-2.5 flex items-center justify-between text-[9px] text-white/40"><span>THIS PHASE</span><span>{Math.round(((progressIndex + 1) / 4) * 100)}%</span></div>
        <div className="grid gap-2">
          {labels.map((label, index) => {
            const done = index < progressIndex;
            const current = index === progressIndex;
            return (
              <div className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-2" key={label}>
                <span className={`grid size-5 place-items-center rounded-full border text-[8px] ${done ? "border-acid-400 bg-acid-400 text-ink-950" : current ? "border-[5px] border-acid-400" : "border-white/15 text-white/35"}`}>
                  {done ? <Check aria-hidden className="size-3" /> : null}
                </span>
                <span><strong className="block text-[11px] font-medium leading-5 text-white/85">{label}</strong><span className="block text-[9px] text-white/38">{done ? "Complete" : current ? "In progress" : "Up next"}</span></span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-[15px] border border-white/[.08] bg-white/[.035] p-3.5">
        <div className="mb-2 flex items-center justify-between text-[9px] text-white/40"><span>LATEST DELIVERY</span><Archive aria-hidden className="size-3.5" /></div>
        <strong className="block truncate text-[11px] font-medium text-white">{workspace ? `${workspace.name} workspace` : "Workspace setup"}</strong>
        <p className="mt-1 text-[10px] leading-4 text-white/45">Approved work is saved safely to Brand and Library.</p>
      </section>
    </aside>
  );
}
