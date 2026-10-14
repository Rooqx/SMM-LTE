import { BookOpen, Maximize2, X } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { reviewOutline } from "@/lib/review-outline";
import { ReviewMarkdown } from "./ReviewMarkdown";

/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The scrollable draft region must be keyboard-focusable. */

interface ReviewReadingFrameProps {
  title: string;
  markdown?: string | undefined;
  children?: ReactNode;
}

/** Keeps long deliverables contained without putting approval controls inside a scroll area. */
export function ReviewReadingFrame({ title, markdown, children }: ReviewReadingFrameProps) {
  const [view, setView] = useState<"preview" | "full">("preview");
  const [readerOpen, setReaderOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  const outline = useMemo(() => (markdown ? reviewOutline(markdown) : null), [markdown]);
  const hasSkim = Boolean(markdown && (markdown.length > 650 || outline?.headings.length));

  function openReader() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    setReaderOpen(true);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", ""); // Test/older-browser fallback.
  }

  function closeReader() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    setReaderOpen(false);
  }

  function goToSection(heading: string) {
    setView("full");
    requestAnimationFrame(() => {
      const draft = draftRef.current;
      const target = Array.from(draft?.querySelectorAll("h2, h3, h4, h5") ?? [])
        .find((element) => element.textContent?.trim() === heading);
      if (draft && target) {
        draft.scrollTop += target.getBoundingClientRect().top - draft.getBoundingClientRect().top;
        draft.focus();
      }
    });
  }

  const content = markdown ? <ReviewMarkdown markdown={markdown} /> : children;

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[.025]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen aria-hidden className="size-4 shrink-0 text-acid-400" />
          <span className="truncate text-sm font-semibold text-white">{title}</span>
        </div>
        {hasSkim ? (
          <div aria-label="Reading mode" className="flex rounded-lg bg-white/[.06] p-0.5" role="group">
            <button
              aria-pressed={view === "preview"}
              className={`rounded-md px-3 py-1.5 text-xs ${view === "preview" ? "bg-acid-400 text-ink-950" : "text-white/65 hover:text-white"}`}
              onClick={() => setView("preview")}
              type="button"
            >
              Quick skim
            </button>
            <button
              aria-pressed={view === "full"}
              className={`rounded-md px-3 py-1.5 text-xs ${view === "full" ? "bg-acid-400 text-ink-950" : "text-white/65 hover:text-white"}`}
              onClick={() => setView("full")}
              type="button"
            >
              Full draft
            </button>
          </div>
        ) : null}
      </div>

      {hasSkim ? (
        <div className="space-y-4 px-4 py-5 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-acid-400">At a glance · excerpts from the draft</p>
          {outline?.excerpt ? (
            <p className="line-clamp-4 text-sm leading-7 text-white/85 sm:text-base">{outline.excerpt}</p>
          ) : null}
          {outline?.headings.length ? (
            <div aria-label="Draft sections" className="flex flex-wrap gap-2">
              {outline.headings.map((heading, index) => (
                <button
                  className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-white/75 hover:border-acid-400/50 hover:text-white focus-visible:outline-2 focus-visible:outline-acid-400"
                  key={`${heading}-${index}`}
                  onClick={() => goToSection(heading)}
                  type="button"
                >
                  {heading} ↗
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-white/45">This is a reading aid. Approval applies to the complete draft.</p>
        </div>
      ) : null}

      <div className="px-4 pb-4 sm:px-5">
        <p className="mb-2 text-xs text-white/45">
          {hasSkim && view === "preview" ? "Preview · scroll for more" : "Complete draft · scroll inside this panel"}
        </p>
        {/* The bounded region must be keyboard-focusable so keyboard users can scroll it. */}
        <div
          aria-label={`${title} draft`}
          className={`scrollbar-thin overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-ink-950/60 px-4 py-5 focus-visible:outline-2 focus-visible:outline-acid-400 sm:px-5 ${hasSkim && view === "preview" ? "max-h-[10rem] sm:max-h-[15rem]" : "max-h-[min(46vh,26rem)] sm:max-h-[min(54vh,34rem)]"}`}
          ref={draftRef}
          role="region"
          tabIndex={0}
        >
          {content}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
        <p className="text-xs text-white/45">Review the full deliverable before approving.</p>
        <button
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/[.08] focus-visible:outline-2 focus-visible:outline-acid-400"
          onClick={openReader}
          type="button"
        >
          <Maximize2 aria-hidden className="size-3.5" /> Open reading view
        </button>
      </div>

      <dialog
        aria-label={`${title} reading view`}
        className="m-auto h-[100dvh] max-h-none w-full max-w-none border border-white/10 bg-ink-950 text-white shadow-2xl backdrop:bg-black/80 sm:h-[min(90dvh,900px)] sm:max-w-4xl sm:rounded-2xl"
        onClose={() => setReaderOpen(false)}
        ref={dialogRef}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-acid-400">Full deliverable</p>
              <h2 className="font-display text-lg font-semibold">{title}</h2>
            </div>
            <button
              aria-label="Close reading view"
              className="grid size-10 shrink-0 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-acid-400"
              onClick={closeReader}
              type="button"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-10 sm:py-8">
            {readerOpen ? content : null}
          </div>
          <div className="border-t border-white/10 px-5 py-3 text-xs text-white/45 sm:px-7">Close this view to approve or request changes.</div>
        </div>
      </dialog>
    </section>
  );
}
/* eslint-enable jsx-a11y/no-noninteractive-tabindex */
