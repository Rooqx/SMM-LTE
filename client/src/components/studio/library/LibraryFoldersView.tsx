import {
  Archive,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  LoaderCircle,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { UI_COPY } from "@/config/ui-copy";
import type { Artifact, GroupedPostSprint } from "@/lib/contracts";

interface LibraryFoldersViewProps {
  groupedSprints?: GroupedPostSprint[] | undefined;
  artifacts?: Artifact[] | undefined;
  isLoading?: boolean | undefined;
  hasMore?: boolean | undefined;
  isLoadingMore?: boolean | undefined;
  onLoadMore?: (() => void) | undefined;
  pageLimitReached?: boolean | undefined;
}

function FolderButton({
  children,
  count,
  expanded,
  onClick,
}: {
  children: ReactNode;
  count: string;
  expanded: boolean;
  onClick: () => void;
}) {
  const FolderIcon = expanded ? FolderOpen : Folder;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      aria-expanded={expanded}
      className="grid min-h-[58px] w-full grid-cols-[36px_minmax(0,1fr)_24px] items-center gap-2.5 rounded-xl border border-white/10 bg-ink-900/80 p-2.5 text-left"
      onClick={onClick}
      type="button"
    >
      <span className="grid size-[34px] place-items-center rounded-[10px] bg-white/[.055] text-acid-400"><FolderIcon aria-hidden className="size-4" /></span>
      <span className="min-w-0"><strong className="block truncate text-[10px] font-medium">{children}</strong><span className="block text-[9px] text-white/42">{count}</span></span>
      <Chevron aria-hidden className="size-4 text-white/42" />
    </button>
  );
}

export function LibraryFoldersView({
  groupedSprints = [],
  artifacts = [],
  isLoading = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  pageLimitReached = false,
}: LibraryFoldersViewProps) {
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({ "0-0": true });
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({ "0-0-0": true });
  const [deliverablesOpen, setDeliverablesOpen] = useState(true);

  return (
    <div aria-labelledby="library-tab-folders" id="library-panel-folders" role="tabpanel">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium">Content archive</h3>
        <span className="text-[9px] text-white/42">Week → day → platform</span>
      </div>

      {isLoading && groupedSprints.length === 0 ? (
        <p className="flex items-center justify-center gap-2 p-12 text-xs text-white/50" role="status"><LoaderCircle aria-hidden className="size-4 animate-spin" /> Organizing content…</p>
      ) : null}
      {!isLoading && groupedSprints.length === 0 && artifacts.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-white/10 p-10 text-center"><Folder aria-hidden className="mx-auto mb-3 size-7 text-white/25" /><p className="text-xs text-white/50">{UI_COPY.library.foldersView.noFolders}</p></div>
      ) : null}

      <div className="grid gap-2">
        {groupedSprints.map((sprint, sprintIndex) => sprint.weeks.map((week, weekIndex) => {
          const weekKey = `${sprintIndex}-${weekIndex}`;
          const weekOpen = Boolean(openWeeks[weekKey]);
          const totalPosts = week.days.reduce((count, day) => count + day.posts.length, 0);
          const sprintLabel = sprint.sprint.toLowerCase().startsWith("sprint") ? sprint.sprint : `Sprint ${sprint.sprint}`;
          return (
            <div key={`${sprint.sprint}-${week.week}`}>
              <FolderButton count={`${totalPosts} files · ${sprintLabel}`} expanded={weekOpen} onClick={() => setOpenWeeks((current) => ({ ...current, [weekKey]: !current[weekKey] }))}>
                Week {week.week}
              </FolderButton>
              {weekOpen ? (
                <div className="ml-7 mt-2 grid gap-2">
                  {week.days.map((day, dayIndex) => {
                    const dayKey = `${weekKey}-${dayIndex}`;
                    const dayOpen = Boolean(openDays[dayKey]);
                    return (
                      <div key={day.date}>
                        <FolderButton count={`${day.posts.length} platform versions`} expanded={dayOpen} onClick={() => setOpenDays((current) => ({ ...current, [dayKey]: !current[dayKey] }))}>
                          {day.date}
                        </FolderButton>
                        {dayOpen ? (
                          <div className="ml-7 mt-2 grid gap-1.5">
                            {day.posts.map((post) => (
                              <article className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] bg-white/[.045] px-2.5 py-2" key={post.id}>
                                <FileText aria-hidden className="size-4 text-acid-400" />
                                <span className="min-w-0">
                                  <strong className="block truncate text-[9px] font-medium">{post.platform}.md</strong>
                                  <span className="block truncate text-[8px] text-white/50">{post.content}</span>
                                </span>
                                <span className="text-[8px] capitalize text-white/42">{post.status}</span>
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        }))}

        {artifacts.length > 0 ? (
          <div>
            <button aria-expanded={deliverablesOpen} className="grid min-h-[58px] w-full grid-cols-[36px_minmax(0,1fr)_24px] items-center gap-2.5 rounded-xl border border-white/10 bg-ink-900/80 p-2.5 text-left" onClick={() => setDeliverablesOpen((open) => !open)} type="button">
              <span className="grid size-[34px] place-items-center rounded-[10px] bg-white/[.055] text-acid-400"><Archive aria-hidden className="size-4" /></span>
              <span><strong className="block text-[10px] font-medium">Strategy & deliverables</strong><span className="block text-[9px] text-white/42">{artifacts.length} approved artifacts</span></span>
              {deliverablesOpen ? <ChevronDown aria-hidden className="size-4 text-white/42" /> : <ChevronRight aria-hidden className="size-4 text-white/42" />}
            </button>
            {deliverablesOpen ? (
              <div className="ml-7 mt-2 grid gap-1.5">
                {artifacts.map((artifact) => <article className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] bg-white/[.045] px-2.5 py-2" key={artifact.id}><FileText aria-hidden className="size-4 text-sky-400" /><strong className="truncate text-[9px] font-medium">{artifact.title ?? artifact.slug}</strong><span className="text-[8px] capitalize text-white/42">{artifact.status}</span></article>)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {hasMore ? <button className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-[11px] border border-white/10 bg-white/[.04] text-[10px]" disabled={isLoadingMore} onClick={onLoadMore} type="button">{isLoadingMore ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}{isLoadingMore ? "Loading…" : "Load more folders"}</button> : null}
      {pageLimitReached ? <p className="mt-3 text-center text-[10px] text-white/42">This view reached its safe page limit.</p> : null}
    </div>
  );
}
