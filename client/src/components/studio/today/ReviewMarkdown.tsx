import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

interface ReviewMarkdownProps {
  markdown: string;
}

/**
 * Present an AI-authored deliverable as readable content, never as raw HTML.
 * External images are omitted so a generated URL cannot load a tracking pixel.
 */
export function ReviewMarkdown({ markdown }: ReviewMarkdownProps) {
  return (
    <div className="min-w-0 space-y-4 overflow-x-auto break-words text-sm leading-7 text-white/80 sm:text-base sm:leading-8">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h2 className="font-display text-lg font-semibold leading-snug text-white sm:text-xl">{children}</h2>,
          h2: ({ children }) => <h3 className="border-b border-white/10 pb-1 font-display text-base font-semibold text-white">{children}</h3>,
          h3: ({ children }) => <h4 className="font-semibold text-white">{children}</h4>,
          h4: ({ children }) => <h5 className="font-semibold text-white/90">{children}</h5>,
          p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 marker:text-acid-400">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 marker:text-acid-400">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-acid-400/60 bg-white/[.03] py-2 pl-3 text-white/70">{children}</blockquote>,
          hr: () => <hr className="border-white/10" />,
          pre: ({ children }) => <pre className="overflow-x-auto rounded-xl border border-white/10 bg-ink-950/65 p-3 text-[11px] leading-5">{children}</pre>,
          code: ({ children }) => <code className="rounded bg-white/[.07] px-1 py-0.5 font-mono text-[.9em] text-white/90">{children}</code>,
          table: ({ children }) => <table className="w-full min-w-[360px] border-collapse text-left text-[11px]">{children}</table>,
          th: ({ children }) => <th className="border-b border-white/15 px-2 py-2 font-semibold text-white">{children}</th>,
          td: ({ children }) => <td className="border-b border-white/[.07] px-2 py-2 align-top">{children}</td>,
          a: ({ children, href }) => href?.startsWith("https://") || href?.startsWith("http://")
            ? <a className="text-acid-400 underline underline-offset-2 hover:text-white" href={href} rel="noopener noreferrer" target="_blank">{children}</a>
            : <>{children}</>,
          img: ({ alt }) => <span className="text-white/45">{alt ? `[Image omitted: ${alt}]` : "[External image omitted]"}</span>,
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
