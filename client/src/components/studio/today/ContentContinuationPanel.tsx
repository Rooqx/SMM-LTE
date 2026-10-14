import { CalendarPlus, Layers3, RefreshCw, Sparkles, X } from "lucide-react";
import { useState, type ReactNode, type SyntheticEvent } from "react";
import type { TodayController } from "./useTodayController";

type Mode = "next_week" | "extra_posts" | "refresh_strategy";

const PLATFORMS = ["linkedin", "x", "instagram", "facebook", "tiktok", "youtube"] as const;
const PLATFORM_LABELS: Record<(typeof PLATFORMS)[number], string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};
const FIELD_CLASS = "w-full rounded-xl border border-white/10 bg-ink-950/70 px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:border-acid-400 focus:outline-none focus:ring-1 focus:ring-acid-400 disabled:cursor-not-allowed disabled:opacity-50";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Keeps recurring work intentionally small: stable brand memory is implicit,
 * while this form collects only facts that can change for the next batch.
 */
export function ContentContinuationPanel({
  isPending,
  onStart,
}: {
  isPending: boolean;
  onStart: TodayController["onStartContentCycle"];
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [changes, setChanges] = useState("");
  const [nothingChanged, setNothingChanged] = useState(false);
  const [weekStart, setWeekStart] = useState(today());
  const [topic, setTopic] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(3);
  const [publicationDate, setPublicationDate] = useState(today());
  const [instructions, setInstructions] = useState("");

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "next_week") {
      await onStart({
        mode,
        weekStart,
        nothingChanged,
        ...(changes.trim() ? { changes: changes.trim() } : {}),
      });
    } else if (mode === "extra_posts") {
      await onStart({
        mode,
        topic: topic.trim(),
        platforms,
        quantity,
        publicationDate,
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      });
    } else if (mode === "refresh_strategy") {
      await onStart({ mode, changes: changes.trim() });
    }
  }

  const canSubmit = mode === "next_week"
    ? nothingChanged || Boolean(changes.trim())
    : mode === "extra_posts"
      ? Boolean(topic.trim() && publicationDate && platforms.length)
      : mode === "refresh_strategy"
        ? Boolean(changes.trim())
        : false;

  return (
    <section className="mt-4 rounded-2xl border border-acid-400/25 bg-acid-400/[.06] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-acid-400">
        This week is ready
      </p>
      <h3 className="mt-1 text-sm font-semibold text-white">
        What would you like Rasm to do next?
      </h3>
      <p className="mt-1 text-xs leading-5 text-white/55">
        Your approved brand and strategy stay saved. You only need to tell us what changed.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <ActionButton icon={CalendarPlus} label="Start next week" onClick={() => setMode("next_week")} />
        <ActionButton icon={Layers3} label="Create extra posts" onClick={() => setMode("extra_posts")} />
        <ActionButton icon={RefreshCw} label="Refresh strategy" onClick={() => setMode("refresh_strategy")} />
      </div>

      {mode ? (
        <form className="mt-4 space-y-3 border-t border-white/10 pt-4" onSubmit={submit}>
          <div className="flex items-center justify-between">
            <strong className="text-xs text-white">
              {mode === "next_week" ? "Plan the next week" : mode === "extra_posts" ? "Create extra posts" : "Refresh the strategy"}
            </strong>
            <button aria-label="Close form" className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" onClick={() => setMode(null)} type="button">
              <X aria-hidden className="size-4" />
            </button>
          </div>

          {mode === "next_week" ? (
            <>
              <Field label="Week starts">
                <input className={FIELD_CLASS} min={today()} onChange={(event) => setWeekStart(event.target.value)} type="date" value={weekStart} />
              </Field>
              <Field label="What changed this week?">
                <textarea className={`${FIELD_CLASS} min-h-20 resize-y`} disabled={nothingChanged} maxLength={4000} onChange={(event) => setChanges(event.target.value)} placeholder="New offer, event, announcement or priority…" value={changes} />
              </Field>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
                <input checked={nothingChanged} className="size-4 accent-[var(--color-acid-400)]" onChange={(event) => { setNothingChanged(event.target.checked); if (event.target.checked) setChanges(""); }} type="checkbox" />
                Nothing changed—continue automatically
              </label>
            </>
          ) : null}

          {mode === "extra_posts" ? (
            <>
              <Field label="What are the posts about?">
                <textarea className={`${FIELD_CLASS} min-h-20 resize-y`} maxLength={240} onChange={(event) => setTopic(event.target.value)} required value={topic} />
              </Field>
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-white/70">Platforms</legend>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((platform) => (
                    <label className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 has-[:checked]:border-acid-400 has-[:checked]:bg-acid-400/10 has-[:checked]:text-acid-400" key={platform}>
                      <input className="sr-only" checked={platforms.includes(platform)} onChange={() => setPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform])} type="checkbox" />
                      {PLATFORM_LABELS[platform]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Number of posts">
                  <input className={FIELD_CLASS} max={15} min={1} onChange={(event) => setQuantity(Number(event.target.value))} type="number" value={quantity} />
                </Field>
                <Field label="Publication date">
                  <input className={FIELD_CLASS} min={today()} onChange={(event) => setPublicationDate(event.target.value)} type="date" value={publicationDate} />
                </Field>
              </div>
              <Field label="Temporary campaign instructions (optional)">
                <textarea className={`${FIELD_CLASS} min-h-16 resize-y`} maxLength={4000} onChange={(event) => setInstructions(event.target.value)} value={instructions} />
              </Field>
            </>
          ) : null}

          {mode === "refresh_strategy" ? (
            <Field label="What materially changed?">
              <textarea className={`${FIELD_CLASS} min-h-24 resize-y`} maxLength={4000} onChange={(event) => setChanges(event.target.value)} placeholder="Describe changes to your goals, audience, offer or positioning…" required value={changes} />
            </Field>
          ) : null}

          <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-acid-400 px-4 text-xs font-bold text-ink-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!canSubmit || isPending} type="submit">
            {isPending ? <RefreshCw aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
            {isPending ? "Starting…" : "Start"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof CalendarPlus; label: string; onClick: () => void }) {
  return (
    <button className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-ink-950/50 px-3 text-xs font-semibold text-white/80 hover:border-acid-400/50 hover:text-white" onClick={onClick} type="button">
      <Icon aria-hidden className="size-4 text-acid-400" />
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-medium text-white/70"><span className="mb-1.5 block">{label}</span>{children}</label>;
}
