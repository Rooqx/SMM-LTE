import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { isBrandAreaKey, type BrandAreaKey } from "@/config/brand";
import { api } from "@/lib/api";
import { buildBrandAreas } from "@/lib/brand-presenter";
import type { ContextItem, Workspace } from "@/lib/contracts";
import { buttonStyles } from "@/components/ui/Button";
import { studioQueryKeys } from "@/lib/query-keys";
import { EmptyState, ErrorState } from "@/components/ui/Feedback";
import { BrandSkeleton } from "@/components/ui/Skeletons";
import { UI_COPY } from "@/config/ui-copy";
import { BrandAreaList } from "./brand/BrandAreaList";
import { BrandDetail } from "./brand/BrandDetail";
import { BrandHeader } from "./brand/BrandHeader";
import { BrandHistoryPanel } from "./brand/BrandHistoryPanel";

const CONTEXT_PAGE_SIZE = 50;
const MAX_RETAINED_CONTEXT_PAGES = 10;

function initialAreaFromUrl(): BrandAreaKey | null {
  if (typeof window === "undefined") return null;
  const area = new URLSearchParams(window.location.search).get("area");
  return isBrandAreaKey(area) ? area : null;
}

export function BrandPage({ workspace }: { workspace?: Workspace | undefined }) {
  const [selectedAreaKey, setSelectedAreaKey] = useState<BrandAreaKey | null>(
    initialAreaFromUrl,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const contextQuery = useInfiniteQuery({
    queryKey: studioQueryKeys.context(workspace?.id),
    queryFn: ({ pageParam, signal }) =>
      api.getContextPage(
        workspace!.id,
        { cursor: pageParam, limit: CONTEXT_PAGE_SIZE },
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(workspace?.id),
  });

  const contextItems = useMemo(
    () => contextQuery.data?.pages.flatMap((page) => page.context) ?? ([] as ContextItem[]),
    [contextQuery.data],
  );
  const areas = useMemo(() => buildBrandAreas(contextItems), [contextItems]);
  const selectedArea =
    areas.find((area) => area.config.key === selectedAreaKey) ?? areas[0];
  // Five core areas make up the brand foundation. Derive the score from
  // approved context rather than presenting a decorative, hard-coded value.
  const foundationScore = Math.round((Math.min(areas.length, 5) / 5) * 100);
  const reachedContextPageLimit =
    (contextQuery.data?.pages.length ?? 0) >= MAX_RETAINED_CONTEXT_PAGES &&
    Boolean(contextQuery.hasNextPage);

  useEffect(() => {
    function restoreAreaFromHistory() {
      setSelectedAreaKey(initialAreaFromUrl());
    }

    window.addEventListener("popstate", restoreAreaFromHistory);
    return () => window.removeEventListener("popstate", restoreAreaFromHistory);
  }, []);

  if (!workspace) {
    return (
      <>
        <h1 className="sr-only">{UI_COPY.brand.title}</h1>
        <EmptyState
          description="Create or select a workspace before reviewing its approved brand memory."
          title="Choose a workspace"
        />
      </>
    );
  }

  if (contextQuery.isPending) {
    return (
      <>
        <h1 className="sr-only">{UI_COPY.brand.title}</h1>
        <BrandSkeleton />
      </>
    );
  }

  if (contextQuery.isError) {
    return (
      <>
        <h1 className="sr-only">{UI_COPY.brand.title}</h1>
        <ErrorState
          message={contextQuery.error.message}
          retry={() => void contextQuery.refetch()}
        />
      </>
    );
  }

  if (!selectedArea) {
    return (
      <div className="space-y-6">
        <BrandHeader />
        <EmptyState
          action={
            <a
              className={buttonStyles("primary")}
              href={`/?workspace=${encodeURIComponent(workspace.id)}`}
            >
              {UI_COPY.brand.startOnboarding}
            </a>
          }
          description={UI_COPY.brand.emptyDescription}
          title={UI_COPY.brand.emptyTitle}
        />
      </div>
    );
  }

  const improveHref = `/?workspace=${encodeURIComponent(workspace.id)}`;

  function selectArea(key: BrandAreaKey) {
    if (selectedAreaKey === key) return;
    setHistoryOpen(false);
    setSelectedAreaKey(key);
    const url = new URL(window.location.href);
    url.searchParams.set("area", key);
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
  }

  return (
    <div>
      <BrandHeader />
      <div className="brand-score mb-3.5 flex items-center gap-3.5 rounded-[14px] bg-acid-400/[.08] p-3.5 sm:p-4">
        <span
          className="score-ring grid size-12 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(#c8ff4d ${foundationScore}%, rgba(255,255,255,0.12) 0)`,
          }}
        >
          <span className="grid size-[38px] place-items-center rounded-full bg-ink-950 text-[10px] font-medium text-white">
            {foundationScore}%
          </span>
        </span>
        <div>
          <strong className="block text-[11px] font-medium text-white">
            Your brand foundation is strong
          </strong>
          <span className="block text-[9px] text-white/45">
            {contextQuery.hasNextPage
              ? UI_COPY.brand.foundationActivePartial(areas.length)
              : `${areas.length} approved areas are actively guiding your content.`}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3.5 min-[720px]:grid-cols-[minmax(0,1fr)_250px] min-[720px]:items-start">
        <div className="order-2 min-[720px]:order-1">
          <BrandAreaList
            areas={areas}
            hasNextPage={Boolean(contextQuery.hasNextPage) && !reachedContextPageLimit}
            isLoadingMore={contextQuery.isFetchingNextPage}
            pageLimitReached={reachedContextPageLimit}
            onLoadMore={() => void contextQuery.fetchNextPage()}
            onSelect={selectArea}
            selectedKey={selectedArea.config.key}
          />
        </div>
        <div className="order-1 min-[720px]:order-2">
          <BrandDetail
            area={selectedArea}
            historyOpen={historyOpen}
            improveHref={improveHref}
            onToggleHistory={() => setHistoryOpen((current) => !current)}
            timezone={workspace.timezone}
          />
          {historyOpen ? (
            <BrandHistoryPanel
              area={selectedArea}
              key={selectedArea.config.key}
              timezone={workspace.timezone}
              workspaceId={workspace.id}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
