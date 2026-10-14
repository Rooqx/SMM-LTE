import { Check, ChevronDown, ChevronUp, Copy, GitFork } from "lucide-react";
import { useState } from "react";
import { UI_COPY } from "@/config/ui-copy";
import type { FinalPost } from "@/lib/contracts";

interface LibraryPostCardProps {
  post: FinalPost;
  highlight?: boolean | undefined;
}

function getPlatformBadgeClasses(platform: string): string {
  const p = platform.toLowerCase();
  if (p === "linkedin") {
    return "border-sky-400/30 bg-sky-400/10 text-sky-400";
  }
  if (p === "instagram") {
    return "border-coral-400/30 bg-coral-400/10 text-coral-400";
  }
  if (p === "x" || p === "twitter") {
    return "border-white/25 bg-white/10 text-white/90";
  }
  return "border-white/15 bg-white/[.06] text-white/80";
}

export function LibraryPostCard({ post, highlight = false }: LibraryPostCardProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [showLineage, setShowLineage] = useState(false);

  async function handleCopy() {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(post.content);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <article
      aria-label={`Post for ${post.platform}: ${post.topic || post.title || "Social post"}`}
      className={`relative rounded-xl border transition ${
        highlight
          ? "border-acid-400/35 bg-acid-400/[.07] p-4"
          : "border-white/10 bg-ink-900/80 p-3 hover:border-white/20"
      }`}
    >
      {/* Post Header: Platform, Date, and Copy Action */}
      <header className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getPlatformBadgeClasses(
              post.platform,
            )}`}
          >
            {post.platform}
          </span>

          {post.local_date ? (
            <span className="text-xs text-white/50">{post.local_date}</span>
          ) : null}

          {post.publication_status ? (
            <span className="rounded-full bg-white/[.05] px-2 py-0.5 text-[10px] text-white/40">
              {post.publication_status}
            </span>
          ) : null}

          {post.campaign ? (
            <span className="hidden sm:inline-block rounded-md border border-white/5 bg-white/[.03] px-2 py-0.5 text-[10px] text-white/40">
              {post.campaign}
            </span>
          ) : null}
        </div>

        <button
          aria-label={`Copy post text for ${post.platform}`}
          className={`flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-[9px] font-medium transition ${
            copied
              ? "border-acid-400 bg-acid-400/10 text-acid-400"
              : copyFailed
                ? "border-coral-400/40 bg-coral-400/10 text-coral-400"
              : "border-white/10 bg-white/[.04] text-white/75 hover:border-white/20 hover:text-white"
          }`}
          onClick={handleCopy}
          type="button"
        >
          {copied ? (
            <>
              <Check aria-hidden className="size-3.5 text-acid-400" />
              <span>{UI_COPY.library.postCard.copiedAction}</span>
            </>
          ) : copyFailed ? (
            <span>Copy failed</span>
          ) : (
            <>
              <Copy aria-hidden className="size-3.5" />
              <span>{UI_COPY.library.postCard.copyAction}</span>
            </>
          )}
        </button>
      </header>

      {copyFailed ? (
        <p className="mt-2 text-xs text-coral-400" role="alert">
          Clipboard access was unavailable. Select the text to copy it manually.
        </p>
      ) : null}

      {/* Post Topic/Title if distinct */}
      {post.topic || post.title ? (
        <div className={`${highlight ? "mt-3 text-lg font-medium text-white" : "mt-2 text-[10px] font-medium text-white/70"}`}>
          {post.topic || post.title}
        </div>
      ) : null}

      {/* Post Body Content */}
      <div className={`${highlight ? "mt-1.5 text-[11px]" : "mt-1 text-[10px] line-clamp-3"} whitespace-pre-wrap font-sans leading-[1.5] text-white/75 selection:bg-acid-400 selection:text-ink-950`}>
        {post.content}
      </div>

      {/* Pinned comment if provided */}
      {post.pinned_comment ? (
        <div className="mt-3 rounded-lg border border-white/[.06] bg-white/[.015] p-2.5 text-xs text-white/70">
          <span className="font-bold text-white/40 uppercase text-[9px] block mb-1">
            Pinned comment
          </span>
          <p className="whitespace-pre-wrap">{post.pinned_comment}</p>
        </div>
      ) : null}

      {/* Lineage & Provenance Disclosure Footer */}
      <footer className="mt-3 flex items-center justify-between border-t border-white/[.05] pt-2 text-[9px] text-white/40">
        <button
          aria-expanded={showLineage}
          className="flex items-center gap-1 text-[11px] hover:text-white/70 transition"
          onClick={() => setShowLineage((prev) => !prev)}
          type="button"
        >
          <GitFork aria-hidden className="size-3" />
          <span>{UI_COPY.library.postCard.lineageLabel}</span>
          {showLineage ? (
            <ChevronUp aria-hidden className="size-3" />
          ) : (
            <ChevronDown aria-hidden className="size-3" />
          )}
        </button>

        <span className="text-[10px] text-white/30 font-mono">
          Rev {post.revision}
        </span>
      </footer>

      {/* Expanded Lineage Details */}
      {showLineage ? (
        <div className="mt-2.5 rounded-lg border border-white/[.06] bg-ink-900/60 p-2.5 text-[11px] font-mono text-white/60 space-y-1">
          <div>
            <span className="text-white/35">Run: </span>
            <span className="text-white/80">{post.run_id}</span>
          </div>
          <div>
            <span className="text-white/35">Artifact: </span>
            <span className="text-white/80">{post.source_artifact_id}</span>
          </div>
          <div>
            <span className="text-white/35">Logical ID: </span>
            <span className="text-white/80">{post.logical_id}</span>
          </div>
        </div>
      ) : null}
    </article>
  );
}
