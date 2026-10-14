import { Activity, BadgeCheck, Brain, Calendar, ClipboardCheck, HelpCircle, MessageSquare, Send, Sparkles } from "lucide-react";
import type { TodayTimelineItem } from "@/lib/today-selector";

export interface TodayActivityFeedProps {
  items: TodayTimelineItem[];
  className?: string;
}

function TimelineIcon({ name }: { name: string }) {
  const classes = "size-3.5";
  if (name === "sparkles") return <Sparkles aria-hidden className={classes} />;
  if (name === "brain-circuit" || name === "brain") return <Brain aria-hidden className={classes} />;
  if (name === "clipboard-check") return <ClipboardCheck aria-hidden className={classes} />;
  if (name === "send") return <Send aria-hidden className={classes} />;
  if (name === "badge-check") return <BadgeCheck aria-hidden className={classes} />;
  if (name === "message-circle" || name === "message-square") return <MessageSquare aria-hidden className={classes} />;
  if (name === "message-circle-question") return <HelpCircle aria-hidden className={classes} />;
  if (name === "calendar-days") return <Calendar aria-hidden className={classes} />;
  return <Activity aria-hidden className={classes} />;
}

export function TodayActivityFeed({ items, className = "" }: TodayActivityFeedProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Current workspace status" className={className}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium text-white">What your agent has done</h3>
        <span className="text-[10px] text-white/40">Latest activity</span>
      </div>
      <div className="grid gap-2">
        {items.map((item, index) => (
          <article className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[11px] bg-white/[.035] px-2.5 py-2" key={`${item.title}-${index}`}>
            <span className="grid size-7 place-items-center rounded-[9px] bg-ink-900 text-acid-400"><TimelineIcon name={item.icon} /></span>
            <span className="min-w-0"><strong className="block truncate text-[10px] font-medium text-white/85">{item.title}</strong><span className="block truncate text-[9px] text-white/38">{item.description}</span></span>
            <span className="whitespace-nowrap text-[9px] text-white/38">{item.time}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
