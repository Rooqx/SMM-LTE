import {
  CalendarDays,
  Check,
  Copy,
  FileText,
  Filter,
  LoaderCircle,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { UI_COPY } from "@/config/ui-copy";
import type { FinalPost } from "@/lib/contracts";

interface LibraryFastViewProps {
  posts: FinalPost[];
  isLoading?: boolean | undefined;
  hasNextPage?: boolean | undefined;
  isFetchingNextPage?: boolean | undefined;
  onLoadMore?: (() => void) | undefined;
  pageLimitReached?: boolean | undefined;
  selectedPlatform: string;
  onSelectPlatform: (platform: string) => void;
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectTab?: ((tab: "fast" | "folders" | "review") => void) | undefined;
}

const PLATFORMS = [
  { id: "all", label: "All platforms" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "instagram", label: "Instagram" },
];

const STATUSES = [
  { id: "all", label: "All statuses" },
  { id: "approved", label: "Approved" },
  { id: "draft", label: "Draft" },
];

const WEEKDAYS = [
  { label: "MON", iso: 1 },
  { label: "TUE", iso: 2 },
  { label: "WED", iso: 3 },
  { label: "THU", iso: 4 },
  { label: "FRI", iso: 5 },
];

function postHeadline(post: FinalPost): string {
  const firstSentence = post.content.trim().match(/^(.+?[.!?])(?:\s|$)/)?.[1];
  return firstSentence ?? post.topic ?? post.title ?? `${post.platform} post`;
}

function postDay(post: FinalPost): number | null {
  if (!post.local_date) return null;
  const day = new Date(`${post.local_date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function PlatformIcon({ platform }: { platform: string }) {
  const normalized = platform.toLowerCase();
  if (normalized === "linkedin") return <span className="text-[11px] font-bold text-sky-400">in</span>;
  if (normalized === "instagram") return <span className="text-[11px] font-bold text-coral-400">ig</span>;
  if (normalized === "x" || normalized === "twitter") return <span className="text-[11px] font-bold text-white">𝕏</span>;
  return <FileText aria-hidden className="size-4" />;
}

function CopyPostButton({ className, post }: { className: string; post: FinalPost }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyPost() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(post.content);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2_500);
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      aria-label={`Copy post text for ${post.platform}`}
      className={className}
      onClick={copyPost}
      type="button"
    >
      {state === "copied" ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
      {state === "copied" ? "Copied!" : state === "failed" ? "Copy failed" : "Copy"}
    </button>
  );
}

export function LibraryFastView({
  posts,
  isLoading = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  pageLimitReached = false,
  selectedPlatform,
  onSelectPlatform,
  selectedStatus,
  onSelectStatus,
  searchQuery,
  onSearchChange,
  onSelectTab,
}: LibraryFastViewProps) {
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const filteredPosts = useMemo(() => posts.filter((post) => {
    if (selectedPlatform !== "all" && post.platform.toLowerCase() !== selectedPlatform) return false;
    if (selectedStatus !== "all" && post.status.toLowerCase() !== selectedStatus) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [post.content, post.topic, post.campaign, post.title]
      .some((value) => value?.toLowerCase().includes(query));
  }), [posts, searchQuery, selectedPlatform, selectedStatus]);
  const spotlightPost = filteredPosts[0];
  const remainingPosts = filteredPosts.slice(1);
  const weekdayCounts = WEEKDAYS.map(({ iso, label }) => ({
    label,
    count: posts.filter((post) => postDay(post) === iso).length,
  }));
  const approvedCount = posts.filter((post) => post.status === "approved").length;
  const reviewCount = posts.filter((post) => post.status === "draft").length;

  return (
    <div aria-labelledby="library-tab-fast" id="library-panel-fast" role="tabpanel">
      {!isLoading && filteredPosts.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[.015] p-10 text-center">
          <Filter aria-hidden className="mx-auto mb-3 size-7 text-white/25" />
          <h3 className="text-sm font-medium text-white/80">{UI_COPY.library.fastView.noResults}</h3>
          <p className="mt-1 text-xs text-white/40">Try adjusting or clearing the filters below.</p>
        </div>
      ) : null}

      {spotlightPost ? (
        <div className="mb-4 grid gap-3.5 min-[720px]:grid-cols-[minmax(0,1.2fr)_minmax(220px,.8fr)]">
          <section className="rounded-[18px] border border-acid-400/35 bg-acid-400/[.07] p-4">
            <div className="flex justify-between gap-2 text-[9px] text-white/45">
              <span className="font-medium uppercase text-acid-400">Next to publish</span>
              <span>{spotlightPost.local_date ?? "Date not scheduled"}</span>
            </div>
            <h2 className="mt-3.5 max-w-[520px] text-lg font-medium leading-[1.3]">{postHeadline(spotlightPost)}</h2>
            <p className="mt-1.5 text-[11px] leading-[1.5] text-white/48">
              {spotlightPost.platform} {spotlightPost.content_format} · {spotlightPost.status} and ready.
            </p>
            {spotlightOpen ? (
              <p className="mt-3 whitespace-pre-wrap border-t border-white/10 pt-3 text-[10px] leading-[1.55] text-white/70">{spotlightPost.content}</p>
            ) : null}
            <div className="mt-3.5 flex flex-wrap gap-2">
              <CopyPostButton className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] bg-acid-400 px-3.5 text-[11px] font-medium text-ink-950" post={spotlightPost} />
              <button className="inline-flex min-h-10 items-center rounded-[11px] border border-white/10 bg-white/[.04] px-3.5 text-[11px] font-medium" onClick={() => setSpotlightOpen((open) => !open)} type="button">
                {spotlightOpen ? "Close full post" : "Open full post"}
              </button>
            </div>
          </section>

          <section className="hidden rounded-[18px] border border-white/10 bg-ink-900/80 p-4 min-[720px]:block">
            <div className="flex justify-between gap-2 text-[9px] text-white/45">
              <span className="font-medium uppercase">This week</span>
              <span>{posts.length} posts</span>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1">
              {weekdayCounts.map((day) => (
                <span className={`min-h-11 rounded-lg p-1.5 text-center text-[8px] ${day.count > 0 ? "bg-acid-400/10 text-acid-400" : "bg-white/[.04] text-white/42"}`} key={day.label}>
                  {day.label}<strong className="mt-0.5 block text-[11px] font-medium text-white">{day.count}</strong>
                </span>
              ))}
            </div>
            <p className="mt-2.5 text-[10px] leading-4 text-white/45">
              {approvedCount} approved · {reviewCount} in review · {Math.max(posts.length - approvedCount - reviewCount, 0)} drafting
            </p>
          </section>
        </div>
      ) : null}

      {remainingPosts.length > 0 ? (
        <section aria-label="Upcoming posts">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium">Up next</h3>
            <span className="text-[9px] text-white/42">Fast access without opening folders</span>
          </div>
          <div className="grid gap-2">
            {remainingPosts.map((post) => (
              <article className="grid min-h-[58px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-white/10 bg-ink-900/80 p-2.5" key={post.id}>
                <span className="grid size-[34px] place-items-center rounded-[10px] bg-white/[.055] text-acid-400"><PlatformIcon platform={post.platform} /></span>
                <span className="min-w-0">
                  <strong className="block truncate text-[10px] font-medium">{postHeadline(post)}</strong>
                  <span className="block text-[9px] capitalize text-white/42">{post.title ?? `${post.local_date ?? "Upcoming"} · ${post.platform}`} · {post.status}</span>
                </span>
                {post.status === "draft" ? (
                  <button
                    className="inline-flex min-h-[34px] items-center rounded-lg bg-white/[.055] px-2 text-[9px] hover:bg-white/10"
                    onClick={() => onSelectTab?.("review")}
                    type="button"
                  >
                    Review
                  </button>
                ) : (
                  <CopyPostButton className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-white/[.055] px-2 text-[9px]" post={post} />
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <details className="mt-4 rounded-xl border border-white/10 bg-white/[.02] p-3">
        <summary className="flex min-h-[34px] cursor-pointer list-none items-center gap-2 text-[10px] font-medium text-white/55">
          <Search aria-hidden className="size-3.5" /> Search and filter posts
        </summary>
        <div className="mt-3 grid gap-3 border-t border-white/[.08] pt-3">
          <input aria-label="Search posts" className="min-h-10 rounded-[10px] border border-white/10 bg-ink-950 px-3 text-[11px]" maxLength={200} onChange={(event) => onSearchChange(event.target.value)} placeholder={UI_COPY.library.fastView.searchPlaceholder} type="search" value={searchQuery} />
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map(({ id, label }) => <button aria-pressed={selectedPlatform === id} className={`min-h-[34px] rounded-lg px-2.5 text-[10px] ${selectedPlatform === id ? "bg-acid-400/15 text-acid-400" : "bg-white/[.04] text-white/48"}`} key={id} onClick={() => onSelectPlatform(id)} type="button">{label}</button>)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map(({ id, label }) => <button aria-pressed={selectedStatus === id} className={`min-h-[34px] rounded-lg px-2.5 text-[10px] ${selectedStatus === id ? "bg-white/10 text-white" : "bg-white/[.04] text-white/48"}`} key={id} onClick={() => onSelectStatus(id)} type="button">{label}</button>)}
          </div>
        </div>
      </details>

      {hasNextPage ? (
        <button className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-[11px] border border-white/10 bg-white/[.04] text-[10px]" disabled={isFetchingNextPage} onClick={onLoadMore} type="button">
          {isFetchingNextPage ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <CalendarDays aria-hidden className="size-4" />}
          {isFetchingNextPage ? "Loading…" : UI_COPY.library.fastView.loadMore}
        </button>
      ) : null}
      {pageLimitReached ? <p className="mt-3 text-center text-[10px] text-white/42">Refine the filters to browse older posts.</p> : null}
    </div>
  );
}
