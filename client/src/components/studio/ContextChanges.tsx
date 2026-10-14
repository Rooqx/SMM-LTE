import { Braces, FilePenLine } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContextUpdate } from "@/lib/contracts";
import { titleCase } from "@/lib/utils";

export type { ContextUpdate } from "@/lib/contracts";

/** Displays staged updates without implying that they are already canonical. */
export function ContextChanges({ updates }: { updates: ContextUpdate[] }) {
  if (!updates.length) return null;
  return (
    <section className="panel rounded-[1.75rem] p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-sky-400/10 text-sky-400">
          <FilePenLine aria-hidden className="size-5" />
        </span>
        <div>
          <p className="eyebrow">Staged context changes</p>
          <h3 className="font-display text-xl font-bold">
            What approval will add to memory
          </h3>
        </div>
      </div>
      <div className="mt-6 grid gap-4">
        {updates.map((update) => (
          <article
            className="rounded-2xl border border-white/8 bg-white/[.025] p-5"
            key={update.key}
          >
            <h4 className="font-display font-bold">{titleCase(update.key)}</h4>
            {update.markdown ? (
              <div className="prose prose-invert mt-3 max-w-none text-sm leading-7 text-white/65">
                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                  {update.markdown}
                </ReactMarkdown>
              </div>
            ) : null}
            {update.data && Object.keys(update.data).length ? (
              <details className="mt-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-sky-400">
                  <Braces aria-hidden className="size-4" />
                  Structured data
                </summary>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-ink-950/60 p-4 text-xs text-white/50">
                  {JSON.stringify(update.data, null, 2)}
                </pre>
              </details>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
