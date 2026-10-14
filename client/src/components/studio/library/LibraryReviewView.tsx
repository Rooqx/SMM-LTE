import { AlertCircle, Check, FileText, LoaderCircle, MessageSquareText, X } from "lucide-react";
import { useState } from "react";
import { UI_COPY } from "@/config/ui-copy";
import type { Artifact } from "@/lib/contracts";

interface LibraryReviewViewProps {
  draftArtifacts: Artifact[];
  isLoading?: boolean | undefined;
  onApprove: (artifact: Artifact) => Promise<void>;
  onReject: (artifact: Artifact) => Promise<void>;
  onRevise: (artifact: Artifact, instructions: string) => Promise<void>;
  isDeciding?: boolean | undefined;
  conflictError?: string | null | undefined;
  onDismissConflict?: (() => void) | undefined;
  actionError?: string | null | undefined;
  onDismissActionError?: (() => void) | undefined;
  hasMore?: boolean | undefined;
  isLoadingMore?: boolean | undefined;
  onLoadMore?: (() => void) | undefined;
  pageLimitReached?: boolean | undefined;
}

export function LibraryReviewView({
  draftArtifacts,
  isLoading = false,
  onApprove,
  onReject,
  onRevise,
  isDeciding = false,
  conflictError = null,
  onDismissConflict,
  actionError = null,
  onDismissActionError,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  pageLimitReached = false,
}: LibraryReviewViewProps) {
  const [revisionForId, setRevisionForId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [instructionError, setInstructionError] = useState("");

  async function submitRevision(artifact: Artifact) {
    const value = instructions.trim();
    if (!value) {
      setInstructionError("Please provide revision instructions.");
      return;
    }
    setInstructionError("");
    try {
      await onRevise(artifact, value);
      setRevisionForId(null);
      setInstructions("");
    } catch {
      // Rejection handled by parent component / React Query mutation onError
    }
  }

  return (
    <div aria-labelledby="library-tab-review" id="library-panel-review" role="tabpanel">
      <div className="section-line my-4 flex items-center justify-between gap-2.5">
        <h3 className="text-xs font-medium text-white">Waiting for your review</h3>
        <span className="text-[9px] text-white/42">{draftArtifacts.length} items</span>
      </div>

      {conflictError ? <Alert message={conflictError} onDismiss={onDismissConflict} title="Deliverable updated" /> : null}
      {actionError ? <Alert message={actionError} onDismiss={onDismissActionError} title="Action not saved" /> : null}
      {isLoading && draftArtifacts.length === 0 ? (
        <p className="flex items-center justify-center gap-2 p-12 text-xs text-white/50" role="status">
          <LoaderCircle aria-hidden className="size-4 animate-spin" /> Checking review queue…
        </p>
      ) : null}
      {!isLoading && draftArtifacts.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-white/10 p-10 text-center">
          <Check aria-hidden className="mx-auto mb-3 size-7 text-acid-400" />
          <p className="text-xs text-white/50">{UI_COPY.library.reviewView.empty}</p>
        </div>
      ) : null}

      <div className="library-list grid gap-2">
        {draftArtifacts.map((artifact) => {
          const itemTitle = artifact.title ?? artifact.slug;
          const isRevising = revisionForId === artifact.id;

          return (
            <article className="rounded-xl border border-white/10 bg-ink-900/80 p-3" key={artifact.id}>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="row-icon grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-white/[.055] text-acid-400">
                    <FileText aria-hidden className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <strong className="block truncate text-[10px] font-medium text-white">{itemTitle}</strong>
                    <div className="text-[9px] text-white/42">
                      <span>{artifact.kind.replaceAll("_", " ")} · Version {artifact.version} · </span>
                      <span className="font-medium text-acid-400">Awaiting review</span>
                    </div>
                  </div>
                </div>

                {!isRevising ? (
                  <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                    <button
                      aria-label={`Reject ${itemTitle}`}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-coral-400/20 bg-coral-400/10 px-2.5 text-[9px] text-coral-400 transition hover:bg-coral-400/20"
                      disabled={isDeciding}
                      onClick={() => void onReject(artifact)}
                      type="button"
                    >
                      <X aria-hidden className="size-3" />
                      Reject
                    </button>
                    <button
                      aria-label={`Ask for changes on ${itemTitle}`}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-white/10 bg-white/[.055] px-2.5 text-[9px] text-white/80 transition hover:bg-white/[.09]"
                      disabled={isDeciding}
                      onClick={() => {
                        setRevisionForId(artifact.id);
                        setInstructions("");
                        setInstructionError("");
                      }}
                      type="button"
                    >
                      <MessageSquareText aria-hidden className="size-3" />
                      Ask for changes
                    </button>
                    <button
                      aria-label={`Approve ${itemTitle}`}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-acid-400 px-3 text-[9px] font-medium text-ink-950 transition hover:bg-acid-300"
                      disabled={isDeciding}
                      onClick={() => void onApprove(artifact)}
                      type="button"
                    >
                      <Check aria-hidden className="size-3" />
                      Approve
                    </button>
                  </div>
                ) : null}
              </div>

              {artifact.content ? (
                <div className="mt-2.5 rounded-[10px] bg-white/[.03] p-2.5 text-[10px] leading-[1.55] text-white/70 line-clamp-3">
                  {artifact.content}
                </div>
              ) : null}

              {isRevising ? (
                <div className="mt-3 border-t border-white/[.08] pt-3">
                  <label className="block text-[10px] font-medium text-white/80" htmlFor={`revision-${artifact.id}`}>
                    What should the agent adjust?
                  </label>
                  <textarea
                    className="mt-1.5 min-h-20 w-full rounded-[10px] border border-white/10 bg-ink-950 p-2.5 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-acid-400/50"
                    id={`revision-${artifact.id}`}
                    maxLength={2_000}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder="Describe exactly what you want adjusted..."
                    value={instructions}
                  />
                  {instructionError ? (
                    <p className="mt-1 text-[10px] text-coral-400" role="alert">
                      {instructionError}
                    </p>
                  ) : null}
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      className="min-h-[34px] rounded-lg px-2.5 text-[9px] text-white/50 transition hover:text-white"
                      onClick={() => {
                        setRevisionForId(null);
                        setInstructionError("");
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="min-h-[34px] rounded-lg bg-acid-400 px-3 text-[9px] font-medium text-ink-950 transition hover:bg-acid-300"
                      disabled={isDeciding}
                      onClick={() => void submitRevision(artifact)}
                      type="button"
                    >
                      Submit changes
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {hasMore ? (
        <button
          className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-[11px] border border-white/10 bg-white/[.04] text-[10px] text-white/70 transition hover:bg-white/[.08]"
          disabled={isLoadingMore}
          onClick={onLoadMore}
          type="button"
        >
          {isLoadingMore ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
          {isLoadingMore ? "Loading…" : "Load more reviews"}
        </button>
      ) : null}
      {pageLimitReached ? (
        <p className="mt-3 text-center text-[10px] text-white/42">This view reached its safe page limit.</p>
      ) : null}
    </div>
  );
}

function Alert({
  message,
  onDismiss,
  title,
}: {
  message: string;
  onDismiss?: (() => void) | undefined;
  title: string;
}) {
  return (
    <div
      className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-coral-400/35 bg-coral-400/10 p-3 text-[10px]"
      role="alert"
    >
      <span className="flex gap-2">
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-coral-400" />
        <span>
          <strong className="block font-medium text-coral-300">{title}</strong>
          {message}
        </span>
      </span>
      {onDismiss ? (
        <button
          aria-label="Dismiss alert"
          className="text-white/60 hover:text-white"
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
