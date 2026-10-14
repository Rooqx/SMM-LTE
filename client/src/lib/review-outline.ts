export interface ReviewOutline {
  headings: string[];
  excerpt: string | null;
}

/**
 * A navigation aid, not a second AI summary. We only reuse words that already
 * appear in the draft and ignore fenced code when looking for headings.
 */
export function reviewOutline(markdown: string): ReviewOutline {
  const headings: string[] = [];
  let excerpt: string | null = null;
  let paragraph: string[] = [];
  let fence: "`" | "~" | null = null;

  const finishParagraph = () => {
    if (excerpt || paragraph.length === 0) return;
    excerpt = paragraph.join(" ").trim();
    paragraph = [];
  };

  // Reading only the beginning bounds work even when a provider returns an
  // unusually large artifact. The complete draft is still rendered below.
  for (const line of markdown.slice(0, 30_000).split(/\r?\n/)) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      finishParagraph();
      const character = fenceMatch[1]![0] as "`" | "~";
      if (!fence) fence = character;
      else if (fence === character) fence = null;
      continue;
    }
    if (fence) continue;

    const heading = /^\s{0,3}#{1,4}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      finishParagraph();
      const title = heading[1]!
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_`]/g, "")
        .trim();
      if (title && headings.length < 6) headings.push(title);
      continue;
    }
    if (!line.trim()) {
      finishParagraph();
      continue;
    }
    if (!excerpt && !/^\s{0,3}(?:[-*+]\s|\d+\.\s|>|\||!\[)/.test(line)) {
      paragraph.push(line.trim());
    }
  }
  finishParagraph();
  return { headings, excerpt };
}
