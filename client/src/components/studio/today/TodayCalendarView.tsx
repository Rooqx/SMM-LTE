import { CalendarDays, Check, LoaderCircle, MessageSquareText, X } from "lucide-react";
import { useState } from "react";
import type { ContentCalendarPresentation } from "@/lib/contracts";
import { ReviewReadingFrame } from "./ReviewReadingFrame";

interface TodayCalendarViewProps {
  calendar?: ContentCalendarPresentation | undefined;
  markdownFallback?: string | undefined;
  onApprove: () => Promise<void>;
  onRevise: (feedback: string) => Promise<void>;
  onReject: () => Promise<void>;
  isApproving?: boolean;
  isRevising?: boolean;
  isRejecting?: boolean;
}

export function TodayCalendarView({
  calendar,
  markdownFallback,
  onApprove,
  onRevise,
  onReject,
  isApproving = false,
  isRevising = false,
  isRejecting = false,
}: TodayCalendarViewProps) {
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [feedback, setFeedback] = useState("");
  const isPendingAction = isApproving || isRevising || isRejecting;

  const raw = calendar as unknown as Record<string, unknown> | undefined;
  const title =
    (raw?.month as string) ||
    calendar?.sprint ||
    "Monthly Content Strategy";
  const theme = (raw?.primary_theme as string) || "";
  const schedule = calendar?.schedule || [];
  const weeklySprints = Array.isArray(raw?.weekly_sprints)
    ? (raw.weekly_sprints as Array<{ week_number: number; focus: string; post_count: number }>)
    : [];

  return (
    <div className="space-y-4">
      {/* Calendar Summary Banner */}
      <ReviewReadingFrame title="Content calendar" markdown={schedule.length || weeklySprints.length ? undefined : markdownFallback}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays aria-hidden className="size-4 text-acid-400" />
            <span className="text-[10px] font-medium text-white">
              {title}
            </span>
          </div>
          {theme ? (
            <span className="rounded-lg bg-acid-400/10 px-2 py-1 text-[9px] text-acid-400">
              Theme: {theme}
            </span>
          ) : calendar?.totalPosts ? (
            <span className="rounded-lg bg-acid-400/10 px-2 py-1 text-[9px] text-acid-400">
              {calendar.totalPosts} posts planned
            </span>
          ) : null}
        </div>

        {/* Schedule Grid */}
        {schedule.length > 0 ? (
          <div>
            <div className="hidden grid-cols-5 gap-2 sm:grid">
              {schedule.map((item, idx) => (
                <div
                  className={`min-h-28 rounded-xl border p-2.5 text-xs ${idx === 0 ? "border-acid-400 bg-acid-400/[.07]" : "border-transparent bg-white/[.045]"}`}
                  key={idx}
                >
                  <div className="flex items-center justify-between gap-1 text-[9px] text-white/45">
                    <span className="uppercase">{item.day}</span>
                    <span className="text-[8px] uppercase text-white/55">
                      {item.platform}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-[10px] font-medium leading-snug text-white/85">
                    {item.topic}
                  </p>
                  <span className="mt-1 block text-[9px] text-white/40">
                    {item.format}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:hidden">
              {schedule.map((item, idx) => (
                <div className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-2 rounded-[11px] bg-white/[.045] p-2.5" key={`mobile-${idx}`}>
                  <span className="text-center text-[9px] uppercase text-white/40">{item.day}</span>
                  <span><strong className="block text-[10px] font-medium text-white/85">{item.topic}</strong><span className="text-[9px] text-white/38">{item.format}</span></span>
                  <span className="rounded-[7px] bg-ink-900 px-2 py-1 text-[8px] uppercase text-white/60">{item.platform}</span>
                </div>
              ))}
            </div>
          </div>
        ) : weeklySprints.length > 0 ? (
          <div>
            {/* Desktop Week Grid */}
            <div className="hidden sm:grid sm:grid-cols-4 gap-2.5">
              {weeklySprints.map((sprint, idx) => (
                <div
                  className="rounded-lg border border-white/[.08] bg-white/[.02] p-3 text-xs"
                  key={idx}
                >
                  <span className="font-bold text-white/50 block mb-1">
                    Week {sprint.week_number}
                  </span>
                  <p className="font-semibold text-white truncate">{sprint.focus}</p>
                  <span className="mt-2 block text-[11px] text-acid-400">
                    {sprint.post_count} posts planned
                  </span>
                </div>
              ))}
            </div>

            {/* Mobile Agenda Rows */}
            <div className="space-y-2 sm:hidden">
              {weeklySprints.map((sprint, idx) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-white/[.08] bg-white/[.02] p-2.5 text-xs"
                  key={idx}
                >
                  <div>
                    <span className="font-bold text-white/50 block">Week {sprint.week_number}</span>
                    <span className="font-semibold text-white">{sprint.focus}</span>
                  </div>
                  <span className="text-acid-400 font-semibold">{sprint.post_count} posts</span>
                </div>
              ))}
            </div>
          </div>
        ) : !markdownFallback ? (
          <p className="text-xs text-white/50 italic">
            Calendar schedule ready for review.
          </p>
        ) : null}
      </ReviewReadingFrame>

      {/* Revision Form Expansion */}
      {showRevisionInput ? (
        <div className="rounded-xl border border-white/15 bg-ink-950/80 p-4 space-y-3">
          <label className="block text-xs font-semibold text-white/70" htmlFor="calendar-revision-input">
            Adjust calendar schedule or angles
          </label>
          <textarea
            className="w-full rounded-lg border border-white/10 bg-white/[.03] p-3 text-sm text-white placeholder:text-white/30 focus:border-acid-400 focus:outline-none"
            id="calendar-revision-input"
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. Shift launch focus to Week 2, add webinar promotion..."
            rows={3}
            value={feedback}
          />
          <div className="flex justify-end gap-2.5">
            <button
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white transition"
              disabled={isPendingAction}
              onClick={() => setShowRevisionInput(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/15 transition disabled:opacity-50"
              disabled={isPendingAction || !feedback.trim()}
              onClick={() => onRevise(feedback.trim())}
              type="button"
            >
              {isRevising ? (
                <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
              ) : (
                <MessageSquareText aria-hidden className="size-3.5" />
              )}
              <span>Submit revision</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          className="flex h-10 items-center gap-2 rounded-xl bg-acid-400 px-5 text-sm font-bold text-ink-950 shadow-md hover:bg-acid-300 disabled:opacity-50 touch-target-min"
          disabled={isPendingAction}
          onClick={onApprove}
          type="button"
        >
          {isApproving ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
          ) : (
            <Check aria-hidden className="size-4" />
          )}
          <span>Approve calendar & continue</span>
        </button>

        <button
          className="flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[.04] px-4 text-sm font-semibold text-white/80 hover:border-white/30 hover:bg-white/[.08] disabled:opacity-50 touch-target-min"
          disabled={isPendingAction}
          onClick={() => setShowRevisionInput((prev) => !prev)}
          type="button"
        >
          <MessageSquareText aria-hidden className="size-4 text-white/60" />
          <span>Ask for changes</span>
        </button>

        <button
          className="flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-coral-400 hover:bg-coral-400/10 disabled:opacity-50 touch-target-min"
          disabled={isPendingAction}
          onClick={onReject}
          type="button"
        >
          {isRejecting ? (
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
          ) : (
            <X aria-hidden className="size-3.5" />
          )}
          <span>Reject draft</span>
        </button>
      </div>
    </div>
  );
}
