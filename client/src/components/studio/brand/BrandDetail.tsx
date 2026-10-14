import { History, Sparkles } from "lucide-react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { BrandArea } from "@/lib/brand-presenter";
import { contextItemLabel, formatContextDate } from "@/lib/brand-presenter";
import { buttonStyles } from "@/components/ui/Button";
import { UI_COPY } from "@/config/ui-copy";
import { BRAND_AREA_ICONS } from "./brand-icons";

interface BrandDetailProps {
  area: BrandArea;
  historyOpen: boolean;
  improveHref: string;
  onToggleHistory: () => void;
  timezone: string;
}

function MarkdownContent({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-invert max-w-none text-[10px] leading-[1.5] text-white/70">
      <ReactMarkdown
        components={{
          a: ({ children, href, ...props }) => {
            const external = Boolean(href?.startsWith("http://") || href?.startsWith("https://"));
            return (
              <a
                {...props}
                className="text-sky-400 underline decoration-sky-400/40 underline-offset-4"
                href={href}
                rel={external ? "noopener noreferrer" : undefined}
                target={external ? "_blank" : undefined}
              >
                {children}
              </a>
            );
          },
          img: ({ alt }) => (
            <span className="block rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-2 text-xs text-white/40">
              {alt ? `Image omitted: ${alt}` : "External image omitted"}
            </span>
          ),
        }}
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={defaultUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function hasDisplayableData(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

function StructuredSummary({ data }: { data: Record<string, unknown> }) {
  const values = Object.entries(data).filter(([, value]) => {
    if (["string", "number", "boolean"].includes(typeof value)) return true;
    return Array.isArray(value) && value.every((entry) => ["string", "number", "boolean"].includes(typeof entry));
  });

  if (values.length === 0) {
    return (
      <p className="text-sm leading-6 text-white/45">
        This approved source is stored as structured memory, but it does not
        have a supported human-readable presentation yet.
      </p>
    );
  }

  return (
    <dl className="grid gap-2">
      {values.map(([key, value]) => (
        <div className="border-b border-white/[.08] py-2 last:border-0" key={key}>
          <dt className="text-[9px] text-white/40">{contextItemLabel(key)}</dt>
          <dd className="mt-1 text-[10px] leading-[1.45] text-white/70">
            {Array.isArray(value) ? value.join(" · ") : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function BrandDetail({
  area,
  historyOpen,
  improveHref,
  onToggleHistory,
  timezone,
}: BrandDetailProps) {
  const Icon = BRAND_AREA_ICONS[area.config.icon];
  const updatedAt = formatContextDate(area.latestUpdatedAt, timezone);

  return (
    <section aria-labelledby="brand-area-heading" className="panel rounded-[18px] p-4">
      <div className="flex items-center justify-between gap-3 text-[9px] uppercase text-white/42">
        <span>
          Approved · {area.items.length === 1 ? `Version ${area.items[0]?.version ?? 1}` : `${area.items.length} sources`}
        </span>
        <Icon aria-hidden className="size-4 text-acid-400" />
      </div>
      <h3 className="mt-3 text-lg font-medium" id="brand-area-heading">
        {area.config.label}
      </h3>
      <p className="mt-1.5 text-[11px] leading-[1.5] text-white/50">{area.config.description}</p>

      <div className="mt-3.5 flex gap-2 rounded-[10px] bg-white/[.035] p-2.5 text-[9px] leading-[1.45] text-white/50">
        <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-acid-400" />
        <p>
          Your agent loads only the relevant approved details—not the entire
          history—when creating a post.
        </p>
      </div>

      <div className="mt-3.5 space-y-2">
        {area.items.map((item) => {
          const itemUpdatedAt = formatContextDate(item.updated_at ?? item.created_at, timezone);
          return (
            <article className="border-b border-white/[.08] py-2.5 last:border-0" key={item.key} title={item.key}>
              <div className="flex items-center justify-between gap-2">
                <span className="block text-[9px] text-white/40">{item.key}</span>
                <span className="text-[8px] font-medium text-acid-400">Current canonical memory</span>
              </div>
              <span className="mb-1.5 mt-0.5 block text-[8px] text-white/28">{contextItemLabel(item.key)} · Version {item.version ?? 1}{itemUpdatedAt ? ` · ${itemUpdatedAt}` : ""}</span>
              {item.markdown ? <MarkdownContent markdown={item.markdown} /> : null}
              {!item.markdown && hasDisplayableData(item.data) ? (
                <StructuredSummary data={item.data} />
              ) : null}
              {!item.markdown && !hasDisplayableData(item.data) ? (
                <p className="text-sm text-white/40">No displayable content is available for this source.</p>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="mt-3.5 border-t border-white/[.08] pt-3.5">
        <p className="mb-3 text-[9px] leading-4 text-white/35">
          {updatedAt ? `Area last updated ${updatedAt}. ` : `${UI_COPY.brand.updateUnavailable} `}
          Earlier versions and decisions remain available in protected history.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            aria-expanded={historyOpen}
            aria-controls="brand-history-panel"
            className={buttonStyles("secondary", "w-full sm:w-auto")}
            onClick={onToggleHistory}
            type="button"
          >
            <History aria-hidden className="size-4" />
            {historyOpen ? UI_COPY.brand.hideVersionHistory : UI_COPY.brand.versionHistory}
          </button>
          <a
            aria-label="Improve in Today"
            className={buttonStyles("primary", "w-full sm:w-auto")}
            href={improveHref}
          >
            {UI_COPY.brand.improveAction}
          </a>
        </div>
      </div>
    </section>
  );
}
