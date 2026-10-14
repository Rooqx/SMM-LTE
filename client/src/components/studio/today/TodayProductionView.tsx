import { ArrowRight, FileText, LoaderCircle, WandSparkles } from "lucide-react";
import type { WorkflowState } from "@/lib/contracts";

interface TodayProductionViewProps {
  onGenerate: () => Promise<void>;
  isGenerating?: boolean;
  plan?: WorkflowState["contentPlan"];
}

export function TodayProductionView({
  onGenerate,
  isGenerating = false,
  plan,
}: TodayProductionViewProps) {
  const platformCounts = new Map<string, { total: number; drafted: number }>();
  for (const slot of plan?.slots ?? []) {
    const count = platformCounts.get(slot.platform) ?? { total: 0, drafted: 0 };
    count.total += 1;
    if (slot.drafted) count.drafted += 1;
    platformCounts.set(slot.platform, count);
  }

  return (
    <div>
      <div className="grid gap-2">
        {[...platformCounts].map(([platform, count]) => (
          <div key={platform} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[11px] border border-white/10 bg-ink-950/45 px-2.5 py-2">
            <div className="grid size-8 place-items-center rounded-[9px] bg-white/[.05] text-sky-400">
              <FileText aria-hidden className="size-4" />
            </div>
            <span>
              <strong className="block text-[10px] font-medium capitalize text-white">{platform}</strong>
              <span className="text-[9px] text-white/40">{count.total} scheduled {count.total === 1 ? "post" : "posts"}</span>
            </span>
            <span className="rounded-lg bg-acid-400/10 px-2 py-1 text-[8px] text-acid-400">
              {count.drafted} / {count.total} drafted
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          className="flex h-11 items-center gap-2 rounded-xl bg-acid-400 px-5 text-sm font-bold text-ink-950 transition hover:bg-white disabled:opacity-50 touch-target-min"
          disabled={isGenerating}
          onClick={() => void onGenerate()}
          type="button"
        >
          {isGenerating ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
          ) : (
            <WandSparkles aria-hidden className="size-4" />
          )}
          {plan?.drafted ? "Continue drafting" : "Start drafting"}
          <ArrowRight aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
