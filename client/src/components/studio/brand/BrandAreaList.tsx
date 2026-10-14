import { ChevronRight } from "lucide-react";
import type { BrandAreaKey } from "@/config/brand";
import { UI_COPY } from "@/config/ui-copy";
import type { BrandArea } from "@/lib/brand-presenter";
import { BRAND_AREA_ICONS } from "./brand-icons";

interface BrandAreaListProps {
  areas: BrandArea[];
  hasNextPage: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  pageLimitReached?: boolean | undefined;
  onSelect: (key: BrandAreaKey) => void;
  selectedKey: BrandAreaKey;
}

export function BrandAreaList({
  areas,
  hasNextPage,
  isLoadingMore,
  onLoadMore,
  pageLimitReached = false,
  onSelect,
  selectedKey,
}: BrandAreaListProps) {
  return (
    <section aria-labelledby="brand-memory-heading" className="panel rounded-[18px] p-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h3 className="text-xs font-medium" id="brand-memory-heading">
          {UI_COPY.brand.memoryHeading}
        </h3>
        <span className="text-[9px] text-white/35">{UI_COPY.brand.updatedAfterApproval}</span>
      </div>
      <div className="grid gap-2">
        {areas.map((area) => {
          const Icon = BRAND_AREA_ICONS[area.config.icon];
          const selected = area.config.key === selectedKey;
          return (
            <button
              aria-pressed={selected}
              className={`grid min-h-[58px] w-full grid-cols-[34px_minmax(0,1fr)_24px] items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                selected
                  ? "border-acid-400/50 bg-acid-400/10"
                  : "border-white/[.08] bg-white/[.025] hover:border-white/20 hover:bg-white/[.05]"
              }`}
              key={area.config.key}
              onClick={() => onSelect(area.config.key)}
              type="button"
            >
              <span className="grid size-[34px] place-items-center rounded-[10px] bg-white/[.06] text-acid-400">
                <Icon aria-hidden className="size-4" />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[10px] font-medium text-white">
                  {area.config.label}
                </strong>
                <span className="mt-0.5 block text-[9px] text-white/40">
                  {area.items.length === 1
                    ? `Approved · Version ${area.items[0]?.version ?? 1}`
                    : `${area.items.length} approved sources`}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-white/30" />
            </button>
          );
        })}
      </div>
      {hasNextPage ? (
        <button
          className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-white/[.035] px-4 text-sm font-bold text-white/65 transition hover:bg-white/[.07] hover:text-white disabled:cursor-wait disabled:opacity-50"
          disabled={isLoadingMore}
          onClick={onLoadMore}
          type="button"
        >
          {isLoadingMore ? UI_COPY.brand.loadingMore : UI_COPY.brand.loadMore}
        </button>
      ) : null}
      {pageLimitReached ? (
        <p className="mt-3 text-center text-xs leading-5 text-white/45">
          The first 500 context records are shown. Narrowing context at the API
          is required before loading more into this view.
        </p>
      ) : null}
    </section>
  );
}
