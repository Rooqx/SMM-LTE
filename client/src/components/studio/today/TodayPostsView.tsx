import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { FinalPost } from "@/lib/contracts";
import { copyToClipboard } from "@/lib/utils";
import { ContentContinuationPanel } from "./ContentContinuationPanel";
import type { TodayController } from "./useTodayController";

interface TodayPostsViewProps {
  posts: FinalPost[];
  isStartingContentCycle: boolean;
  onStartContentCycle: TodayController["onStartContentCycle"];
}

export function TodayPostsView({ posts, isStartingContentCycle, onStartContentCycle }: TodayPostsViewProps) {
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);

  async function handleCopy(post: FinalPost) {
    const ok = await copyToClipboard(post.content);
    if (ok) {
      setCopyErrorId(null);
      setCopiedPostId(post.id);
      setTimeout(() => setCopiedPostId(null), 2500);
    } else {
      setCopiedPostId(null);
      setCopyErrorId(post.id);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-[10px] text-white/45">
        <span>{posts.length} posts shown in this view</span>
        <span className="text-acid-400 font-semibold">Copy & publish</span>
      </div>

      <div
        className="grid max-h-[520px] gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/[.015] p-2 pr-1.5 focus:outline-none focus:ring-1 focus:ring-acid-400/40"
        tabIndex={0}
        aria-label="Posts ready to publish"
      >
        {posts.map((post) => {
          const isCopied = copiedPostId === post.id;
          const copyFailed = copyErrorId === post.id;
          return (
            <article
              className="rounded-xl border border-white/10 bg-ink-950/45 p-3 transition hover:border-white/20"
              key={post.id}
            >
              <header className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-white/15 bg-white/[.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80">
                    {post.platform}
                  </span>
                  {post.publication_status ? (
                    <span className="text-[10px] text-white/40">
                      Status: {post.publication_status}
                    </span>
                  ) : null}
                </div>

                <button
                  aria-label={`Copy post for ${post.platform}`}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition touch-target-min ${
                    isCopied
                      ? "border-acid-400 bg-acid-400/10 text-acid-400"
                      : copyFailed
                        ? "border-coral-400/40 bg-coral-400/10 text-coral-400"
                      : "border-white/10 bg-white/[.04] text-white/70 hover:border-white/20 hover:text-white"
                  }`}
                  onClick={() => handleCopy(post)}
                  type="button"
                >
                  {isCopied ? (
                    <>
                      <Check aria-hidden className="size-3.5 text-acid-400" />
                      <span>Copied</span>
                    </>
                  ) : copyFailed ? (
                    <span>Copy failed</span>
                  ) : (
                    <>
                      <Copy aria-hidden className="size-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </header>

              {copyFailed ? (
                <p className="mb-2 text-xs text-coral-400" role="alert">
                  Clipboard access was unavailable. Select the text to copy it manually.
                </p>
              ) : null}

              <p className="whitespace-pre-wrap font-sans text-[10px] leading-[1.5] text-white/80">
                {post.content}
              </p>
            </article>
          );
        })}
      </div>
      <ContentContinuationPanel
        isPending={isStartingContentCycle}
        onStart={onStartContentCycle}
      />
    </div>
  );
}
