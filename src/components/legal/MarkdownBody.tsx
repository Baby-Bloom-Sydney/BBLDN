// Renders a legal document's `body_md` blocks (L-009 `3b`).
//
// React elements only — no `dangerouslySetInnerHTML` anywhere, so there is no path from a document body to
// executable markup even if a body is ever edited by something other than a migration.
//
// Typography matches the pages this replaces (`prose prose-sm prose-slate`, the shipped Tailwind typography
// plugin) so the visual result is the one the site already had; what changed is where the words come from.
import type { ReactNode } from "react";
import type { MarkdownBlock } from "@/lib/legal/parse-markdown-blocks";

const BOLD = /\*\*([^*]+)\*\*/g;

/**
 * `**bold**` → `<strong>`, everything else verbatim text. Split rather than replaced into HTML: the segments
 * become React children, so an asterisk-free body is plain text and a malformed one is visible characters.
 */
function inline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(BOLD)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(<strong key={`b${at}`}>{match[1]}</strong>);
    cursor = at + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length === 0 ? text : parts;
}

function block(item: MarkdownBlock, key: number): ReactNode {
  switch (item.kind) {
    case "rule":
      return <hr key={key} />;
    case "heading":
      if (item.level === 1) return <h2 key={key}>{inline(item.text)}</h2>;
      if (item.level === 2) return <h3 key={key}>{inline(item.text)}</h3>;
      return <h4 key={key}>{inline(item.text)}</h4>;
    case "list":
      return (
        <ul key={key}>
          {item.items.map((entry, index) => (
            <li key={index}>{inline(entry)}</li>
          ))}
        </ul>
      );
    case "paragraph":
      return <p key={key}>{inline(item.text)}</p>;
  }
}

export function MarkdownBody({
  blocks,
}: {
  readonly blocks: ReadonlyArray<MarkdownBlock>;
}) {
  return (
    <div className="prose prose-sm prose-slate max-w-none prose-headings:text-base prose-headings:font-semibold prose-p:text-slate-600 prose-li:text-slate-600">
      {blocks.map(block)}
    </div>
  );
}
