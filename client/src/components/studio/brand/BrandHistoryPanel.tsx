import { useInfiniteQuery } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { useState } from "react";
import type { BrandArea } from "@/lib/brand-presenter";
import { contextItemLabel, formatContextDate } from "@/lib/brand-presenter";
import { api } from "@/lib/api";
import { studioQueryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/ui/Feedback";

const HISTORY_PAGE_SIZE = 20;

interface BrandHistoryPanelProps {
  area: BrandArea;
  timezone: string;
  workspaceId: string;
}

/**
 * Loads one context key at a time so a large Brand area cannot fan out into an
 * unbounded number of requests. History stays read-only; canonical updates
 * continue to flow through the reviewed orchestration in Today.
 */
export function BrandHistoryPanel({
  area,
  timezone,
  workspaceId,
}: BrandHistoryPanelProps) {
  const [selectedKey, setSelectedKey] = useState(area.items[0]?.key ?? "");

  const historyQuery = useInfiniteQuery({
    queryKey: studioQueryKeys.contextHistory(workspaceId, selectedKey),
    queryFn: ({ pageParam, signal }) =>
      api.getContextHistory(
        workspaceId,
        { key: selectedKey, limit: HISTORY_PAGE_SIZE, cursor: pageParam },
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(selectedKey),
  });

  const revisions = historyQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section
      aria-labelledby="brand-history-heading"
      className="panel mt-3 rounded-[18px] p-4"
      id="brand-history-panel"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[.08] pb-3">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wider text-acid-400">
            Protected record
          </p>
          <h3 className="mt-1 text-sm font-medium" id="brand-history-heading">
            Version history
          </h3>
        </div>
        {area.items.length > 1 ? (
          <label className="grid gap-1 text-[9px] text-white/45">
            Brand detail
            <select
              className="min-h-10 rounded-[10px] border border-white/10 bg-ink-900 px-3 text-[10px] text-white outline-none focus:border-acid-400"
              onChange={(event) => setSelectedKey(event.target.value)}
              value={selectedKey}
            >
              {area.items.map((item) => (
                <option key={item.key} value={item.key}>
                  {contextItemLabel(item.key)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {historyQuery.isPending ? <LoadingState label="Loading version history" /> : null}
      {historyQuery.isError ? (
        <ErrorState
          message={historyQuery.error.message}
          retry={() => void historyQuery.refetch()}
        />
      ) : null}
      {historyQuery.isSuccess && revisions.length === 0 ? (
        <p className="py-5 text-[10px] text-white/45">No earlier versions are available for this detail.</p>
      ) : null}

      {revisions.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {revisions.map((revision, index) => {
            const date = formatContextDate(String(revision.created_at), timezone);
            return (
              <details
                className="rounded-xl border border-white/[.08] bg-white/[.025] p-3 open:bg-white/[.04]"
                key={revision.id}
                open={index === 0}
              >
                <summary className="cursor-pointer list-none text-[10px] font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    <span>Version {revision.revision}</span>
                    <span className="flex items-center gap-1.5 text-[9px] font-normal text-white/40">
                      <Clock3 aria-hidden className="size-3" />
                      {date ?? "Date unavailable"} · {revision.status}
                    </span>
                  </span>
                </summary>
                <p className="mt-3 whitespace-pre-wrap border-t border-white/[.08] pt-3 text-[10px] leading-[1.55] text-white/65">
                  {revision.markdown || "This revision contains structured data only."}
                </p>
              </details>
            );
          })}
        </div>
      ) : null}

      {historyQuery.hasNextPage ? (
        <Button
          className="mt-3 w-full"
          loading={historyQuery.isFetchingNextPage}
          onClick={() => void historyQuery.fetchNextPage()}
          tone="secondary"
          type="button"
        >
          Load earlier versions
        </Button>
      ) : null}
    </section>
  );
}
