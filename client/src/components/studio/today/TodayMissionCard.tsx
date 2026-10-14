import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

interface TodayMissionCardProps {
  kicker: string;
  heading: string;
  subheading: string;
  statusBadge: {
    text: string;
    icon: string;
    pulse?: boolean | undefined;
    timeLabel?: string | undefined;
  };
  children?: ReactNode;
}

export function TodayMissionCard({
  kicker,
  heading,
  subheading,
  statusBadge,
  children,
}: TodayMissionCardProps) {
  return (
    <article
      aria-labelledby="today-mission-heading"
      className="rounded-[18px] border border-white/10 bg-ink-900/80 p-4 shadow-2xl sm:p-5"
    >
      <header className="mb-[18px] flex items-center justify-between gap-2.5">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[.12em] text-acid-400">
          <Sparkles aria-hidden className="size-3.5" />
          {kicker}
        </span>
        <span className="text-[10px] text-white/40">
          {statusBadge.timeLabel ?? "Current task"}
        </span>
      </header>

      <div className="flex items-start gap-3">
        <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-acid-400/10 text-acid-400">
          <Sparkles aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="mb-1 text-[10px] text-white/42">Your social media manager</p>
          <h2 className="text-lg font-medium leading-snug text-white" id="today-mission-heading">
            {heading}
          </h2>
          <p className="mt-1 text-xs leading-5 text-white/52">{subheading}</p>
        </div>
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </article>
  );
}
