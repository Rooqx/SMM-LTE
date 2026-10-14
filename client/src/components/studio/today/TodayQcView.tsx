import { AlertCircle, Check, CheckCircle2, LoaderCircle, MessageSquareText, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { QcScorecardPresentation } from "@/lib/contracts";
import { ReviewReadingFrame } from "./ReviewReadingFrame";

interface TodayQcViewProps {
  qcScorecard?: QcScorecardPresentation | undefined;
  markdownFallback?: string | undefined;
  onApprove: () => Promise<void>;
  onRevise: (feedback: string) => Promise<void>;
  onReject: () => Promise<void>;
  isApproving?: boolean | undefined;
  isRevising?: boolean | undefined;
  isRejecting?: boolean | undefined;
}

export function TodayQcView({
  qcScorecard,
  markdownFallback,
  onApprove,
  onRevise,
  onReject,
  isApproving = false,
  isRevising = false,
  isRejecting = false,
}: TodayQcViewProps) {
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  const isPendingAction = isApproving || isRevising || isRejecting;

  async function handleSendRevision() {
    setFeedbackError("");
    const trimmed = feedback.trim();
    if (!trimmed) {
      setFeedbackError("Please describe what changes you would like made.");
      return;
    }
    await onRevise(trimmed);
  }

  const passedCount = qcScorecard?.passedCount ?? 0;
  const failedCount = qcScorecard?.failedCount ?? 0;
  const warnings = qcScorecard?.warnings ?? [];
  const recommendations = qcScorecard?.recommendations ?? [];
  const hasStructuredMetrics = Boolean(qcScorecard);

  return (
    <div className="space-y-6">
      {/* Scorecard Presentation Surface */}
      <ReviewReadingFrame title="Quality & compliance scorecard" markdown={qcScorecard ? undefined : markdownFallback}>
        <div>
        <div className="flex items-center justify-between border-b border-white/[.07] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-4 text-acid-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">
              Quality & Compliance Scorecard
            </span>
          </div>
          <span className="text-[11px] text-white/40 font-mono">
            Phase 4 Verification
          </span>
        </div>

        {/* Only show numeric metrics when the backend supplied structured data.
            Markdown reviews are valid, but displaying invented zeroes is not. */}
        {hasStructuredMetrics ? (
          <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-xl border border-acid-400/20 bg-acid-400/5 p-3 flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg bg-acid-400/15 text-acid-400">
              <CheckCircle2 aria-hidden className="size-4" />
            </div>
            <div>
              <span className="text-lg font-bold text-white leading-none">
                {passedCount}
              </span>
              <span className="text-[11px] text-acid-400/80 block mt-0.5">
                Checks Passed
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-coral-400/20 bg-coral-400/5 p-3 flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg bg-coral-400/15 text-coral-400">
              <AlertCircle aria-hidden className="size-4" />
            </div>
            <div>
              <span className="text-lg font-bold text-white leading-none">
                {failedCount}
              </span>
              <span className="text-[11px] text-coral-400/80 block mt-0.5">
                Warnings / Items
              </span>
            </div>
          </div>
          </div>
        ) : (
          <div className="mb-5 rounded-xl border border-acid-400/20 bg-acid-400/5 px-3 py-2.5 text-xs text-acid-300">
            Detailed quality review ready
          </div>
        )}

        {/* Warnings List */}
        {warnings.length > 0 ? (
          <div className="space-y-2 mb-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-coral-400/90">
              Flagged Items
            </span>
            <ul className="space-y-1.5">
              {warnings.map((warn, idx) => (
                <li
                  className="rounded-lg border border-coral-400/20 bg-coral-400/5 px-3 py-2 text-xs text-white/80 flex items-start gap-2"
                  key={idx}
                >
                  <AlertCircle aria-hidden className="size-3.5 text-coral-400 shrink-0 mt-0.5" />
                  <span>{warn}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Recommendations List */}
        {recommendations.length > 0 ? (
          <div className="space-y-2 mb-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
              Recommendations
            </span>
            <ul className="space-y-1.5">
              {recommendations.map((rec, idx) => (
                <li
                  className="rounded-lg border border-white/10 bg-white/[.02] px-3 py-2 text-xs text-white/75"
                  key={idx}
                >
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        </div>
      </ReviewReadingFrame>

      {/* Revision Input (Expandable) */}
      {showRevisionInput ? (
        <div className="space-y-3 rounded-xl border border-acid-400/30 bg-acid-400/[.03] p-4">
          <label
            className="block text-xs font-semibold text-white/90"
            htmlFor="qc-feedback-input"
          >
            What quality adjustments should be made?
          </label>
          <textarea
            className="w-full rounded-lg border border-white/20 bg-ink-950 p-3 text-xs text-white placeholder-white/40 focus:border-acid-400 focus:outline-none focus:ring-1 focus:ring-acid-400"
            disabled={isPendingAction}
            id="qc-feedback-input"
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. Tone in the second post sounds slightly too informal; adjust to match authority voice rules..."
            rows={3}
            value={feedback}
          />
          {feedbackError ? (
            <p className="text-xs text-red-400" role="alert">
              {feedbackError}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[.05] transition-colors"
              disabled={isPendingAction}
              onClick={() => {
                setShowRevisionInput(false);
                setFeedbackError("");
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-acid-400 px-4 py-1.5 text-xs font-bold text-ink-950 hover:bg-acid-300 transition-colors disabled:opacity-60"
              disabled={isPendingAction}
              onClick={handleSendRevision}
              type="button"
            >
              {isRevising ? (
                <>
                  <LoaderCircle aria-hidden className="size-3 animate-spin" />
                  <span>Submitting…</span>
                </>
              ) : (
                <span>Submit adjustments</span>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {/* Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/[.06]">
        <div className="text-xs text-white/40">
          Approval confirms quality standards and prepares Phase 5 distribution.
        </div>

        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            disabled={isPendingAction}
            onClick={onReject}
            type="button"
          >
            {isRejecting ? (
              <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
            ) : (
              <X aria-hidden className="size-3.5" />
            )}
            <span>Reject</span>
          </button>

          {!showRevisionInput ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.04] px-3.5 py-2 text-xs font-medium text-white/80 hover:bg-white/[.08] hover:text-white transition-colors disabled:opacity-50"
              disabled={isPendingAction}
              onClick={() => setShowRevisionInput(true)}
              type="button"
            >
              <MessageSquareText aria-hidden className="size-3.5 text-white/60" />
              <span>Ask for changes</span>
            </button>
          ) : null}

          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-acid-400 px-4 py-2 text-xs font-bold text-ink-950 shadow-md hover:bg-acid-300 transition-colors disabled:opacity-60"
            disabled={isPendingAction}
            onClick={onApprove}
            type="button"
          >
            {isApproving ? (
              <>
                <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
                <span>Approving…</span>
              </>
            ) : (
              <>
                <Check aria-hidden className="size-3.5" />
                <span>Approve scorecard & continue</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
