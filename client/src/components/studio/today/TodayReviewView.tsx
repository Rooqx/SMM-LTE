import { Check, LoaderCircle, MessageSquareText, X } from "lucide-react";
import { useState } from "react";
import type { BrandFoundationPresentation } from "@/lib/contracts";
import { ReviewReadingFrame } from "./ReviewReadingFrame";

interface TodayReviewViewProps {
  brandFoundation?: BrandFoundationPresentation | undefined;
  markdownFallback?: string | undefined;
  onApprove: () => Promise<void>;
  onRevise: (feedback: string) => Promise<void>;
  onReject: () => Promise<void>;
  isApproving?: boolean;
  isRevising?: boolean;
  isRejecting?: boolean;
}

export function TodayReviewView({
  brandFoundation,
  markdownFallback,
  onApprove,
  onRevise,
  onReject,
  isApproving = false,
  isRevising = false,
  isRejecting = false,
}: TodayReviewViewProps) {
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  const isPendingAction = isApproving || isRevising || isRejecting;

  const raw = brandFoundation as unknown as Record<string, unknown> | undefined;
  const brandName = brandFoundation?.brandName || (raw?.brand_name as string) || "";
  const positioning =
    brandFoundation?.positioningSummary ||
    (raw?.positioning_statement as string) ||
    "";
  const pillars: string[] =
    brandFoundation?.pillars ||
    (Array.isArray(raw?.brand_pillars) ? (raw.brand_pillars as string[]) : []);
  const audience =
    brandFoundation?.targetAudience ||
    (Array.isArray(raw?.audience_personas)
      ? (raw.audience_personas as string[]).join(", ")
      : "");
  const voiceTone: string[] =
    brandFoundation?.voiceTone ||
    (Array.isArray(raw?.voice_rules) ? (raw.voice_rules as string[]) : []);

  async function handleSendRevision() {
    setFeedbackError("");
    const trimmed = feedback.trim();
    if (!trimmed) {
      setFeedbackError("Please describe what changes you would like made.");
      return;
    }
    await onRevise(trimmed);
  }

  return (
    <div className="space-y-4">
      {/* Deliverable Presentation Surface */}
      <ReviewReadingFrame title="Brand foundation" markdown={brandFoundation ? undefined : markdownFallback}>
        {brandFoundation ? (
          <div className="grid gap-0">
            {brandName ? (
              <div className="flex items-center justify-between border-b border-white/[.07] py-2.5">
                <span className="text-xs text-white/55">
                  Brand Foundation
                </span>
                <span className="text-sm font-medium text-acid-400">
                  {brandName}
                </span>
              </div>
            ) : null}

            {/* Positioning Statement */}
            {positioning ? (
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-white/[.07] py-2.5 max-[440px]:grid-cols-1 max-[440px]:gap-1">
                <span className="text-xs text-white/55">
                  Positioning Statement
                </span>
                <p className="text-sm font-medium leading-relaxed text-white">
                  {positioning}
                </p>
              </div>
            ) : null}

            {/* Brand Pillars */}
            {pillars.length > 0 ? (
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-white/[.07] py-2.5 max-[440px]:grid-cols-1 max-[440px]:gap-1">
                <span className="text-xs text-white/55">
                  Core Brand Pillars
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {pillars.map((pillar, idx) => (
                    <span
                      className="rounded-lg bg-white/[.05] px-2 py-1 text-xs text-white/75"
                      key={idx}
                    >
                      {pillar}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Target Audience */}
            {audience ? (
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-white/[.07] py-2.5 max-[440px]:grid-cols-1 max-[440px]:gap-1">
                <span className="text-xs text-white/55">
                  Target Audience
                </span>
                <p className="text-sm font-medium leading-relaxed text-white/85">
                  {audience}
                </p>
              </div>
            ) : null}

            {/* Voice & Tone Rules */}
            {voiceTone.length > 0 ? (
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2.5 max-[440px]:grid-cols-1 max-[440px]:gap-1">
                <span className="text-xs text-white/55">
                  Voice & Tone Guidelines
                </span>
                <ul className="space-y-1 text-sm leading-relaxed text-white/70">
                  {voiceTone.map((rule, idx) => (
                    <li className="flex items-start gap-2" key={idx}>
                      <span className="text-acid-400">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : !markdownFallback ? (
          <p className="text-sm text-white/50 italic">
            Deliverable content compiled. Review details below to continue.
          </p>
        ) : null}
      </ReviewReadingFrame>

      {/* Revision Form Expansion */}
      {showRevisionInput ? (
        <div className="rounded-xl border border-white/15 bg-ink-950/80 p-4 space-y-3">
          <label className="block text-xs font-semibold text-white/70" htmlFor="revision-feedback-input">
            What would you like adjusted?
          </label>
          <textarea
            className="w-full rounded-lg border border-white/10 bg-white/[.03] p-3 text-sm text-white placeholder:text-white/30 focus:border-acid-400 focus:outline-none"
            id="revision-feedback-input"
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. Tone should be more direct, add focus on founders..."
            rows={3}
            value={feedback}
          />
          {feedbackError ? (
            <p className="text-xs text-coral-400">{feedbackError}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:text-white"
              onClick={() => {
                setShowRevisionInput(false);
                setFeedbackError("");
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
              disabled={isPendingAction}
              onClick={handleSendRevision}
              type="button"
            >
              {isRevising ? (
                <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
              ) : (
                <MessageSquareText aria-hidden className="size-3.5" />
              )}
              <span>Send revision request</span>
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
          <span>Approve & continue</span>
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
