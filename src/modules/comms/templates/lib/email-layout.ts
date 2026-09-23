// The one email shell, so a template file carries its words and nothing else. Both bodies are built from the
// same blocks, which is what keeps the HTML and the text halves from drifting apart — a template that grows a
// paragraph in one body only is the classic way a plain-text reader ends up with half an email.
//
// **Blocks arrive already escaped.** `paragraphs` is markup by the time it gets here (a template escapes each
// value it interpolates — `escape-html.ts`); `textParagraphs` is the same content unescaped for the text half.
import { BRAND } from "@/modules/config";
import { footer } from "./footer";

type LayoutBlocks = {
  readonly heading: string;
  /** HTML-safe paragraph strings, in order. */
  readonly paragraphs: ReadonlyArray<string>;
  /** The same paragraphs as plain text, in the same order. */
  readonly textParagraphs: ReadonlyArray<string>;
  readonly cta?: { readonly label: string; readonly href: string };
};

type LaidOut = { readonly html: string; readonly text: string };

const BUTTON =
  "display:inline-block;padding:12px 20px;border-radius:8px;background:#4c1d95;color:#ffffff;text-decoration:none;font-weight:600";

// Named `emailLayout`, not `layout`: the boundary lint reserves a bare `layout` export for Next's route file
// convention (05 §7 rules 4–5), and a helper that borrows a framework's reserved name is a rule waiting to fire.
export function emailLayout(blocks: LayoutBlocks): LaidOut {
  const end = footer();
  const body = blocks.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;line-height:1.6">${paragraph}</p>`,
    )
    .join("");
  const button =
    blocks.cta === undefined
      ? ""
      : `<p style="margin:24px 0"><a href="${blocks.cta.href}" style="${BUTTON}">${blocks.cta.label}</a></p>`;
  return Object.freeze({
    html:
      `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1917;max-width:560px;margin:0 auto;padding:24px">` +
      `<h1 style="font-size:20px;margin:0 0 20px">${blocks.heading}</h1>` +
      `${body}${button}${end.html}</div>`,
    text:
      `${BRAND.longName}\n\n${blocks.heading}\n\n` +
      `${blocks.textParagraphs.join("\n\n")}` +
      `${blocks.cta === undefined ? "" : `\n\n${blocks.cta.label}: ${blocks.cta.href}`}` +
      `${end.text}`,
  });
}
