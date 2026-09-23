// `body_md` → a list of blocks a React component can render (L-009 `3b`).
//
// **Why any parsing at all.** The unit's promise is that the solicitor's text lands as version 2 of the same
// rows and no page changes. A page that rendered `body_md` as preformatted text (what `PolicyModal` does, and
// which is fine for a 200-word draft in a dialog) would keep that promise only in the sense that it would not
// crash: ratified terms would publish with literal `##` and `-` down the middle of a legal page. So the pages
// render blocks, and the seed — which is a heading, a bold line and four paragraphs — renders correctly today
// with the same code that will render the real thing.
//
// **Why not a markdown library.** `package.json` has none, the bodies are ours rather than user input, and the
// six constructs below are the whole of what `0026` writes and what a policy document needs. Adding a parser
// (and, for most of them, a sanitiser behind it) to render six constructs is a dependency and an HTML-injection
// surface bought for nothing. Nothing here ever produces raw HTML: the component builds React elements, so a
// script tag written into a body is characters on the page, not a script. (Spelling it out rather than showing
// it, because `consent-gate.repo.test.ts` enumerates every file in the tree that contains one — correctly.)
//
// **Deliberately not supported**, because no current body uses them and a half-parser is worse than none:
// tables, block quotes, code fences, links, ordered lists, and inline emphasis other than `**bold**`. Each
// arrives as literal characters in a paragraph — visible, wrong, and therefore noticed — rather than silently
// swallowed. When a ratified body needs one, it is added here with its own case.

export type MarkdownBlock =
  | {
      readonly kind: "heading";
      readonly level: 1 | 2 | 3;
      readonly text: string;
    }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "list"; readonly items: ReadonlyArray<string> }
  | { readonly kind: "rule" };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;

export function parseMarkdownBlocks(
  body: string,
): ReadonlyArray<MarkdownBlock> {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
    if (items.length > 0) {
      blocks.push({ kind: "list", items: [...items] });
      items = [];
    }
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();

    if (line === "") {
      flush();
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet !== null) {
      if (paragraph.length > 0) flush();
      items.push(bullet[1].trim());
      continue;
    }
    if (items.length > 0) flush();
    paragraph.push(line);
  }

  flush();
  return blocks;
}
