// The copy claim as an executable test (ADR-124). Every surface `1g` renders — this module's `components/`, the
// card vocabulary a parent reads, and the route file it owns — passes the 05 §5.2 word list with no allowlist
// row for S-P-08.
//
// The ban bites in a specific way on this screen. 04 §6.2's fate line for S-P-08 says "**interview → meeting**"
// in those words, so the stage `INTRO_SCHEDULED` reads "Meeting arranged" and the word "interview" appears
// nowhere; and 04 §6.2 / §9 both prescribe "**arranged by your matchmaker**" for an admin-set time, so that
// exact string is pinned by name and a reword cannot pass unnoticed.
//
// **Scope, as `1d` and `1e` set it.** The rendered surfaces are `components/`, `connection-card-view.ts` (which
// is where every word a parent reads on this screen actually lives) and the owned route file. The module's other
// `lib/` files carry the **stage contract's own vocabulary** — `job-not-named`, `not-party`, the
// `connection_stage` enum values — which a parent never reads and which cannot be reworded without changing the
// contract and the database. The static check scans them under the accepted `banned-literals` red.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WORD_ALLOWLIST } from "../../../../tests/e2e/words/allowlist";

const REPO_ROOT = resolve(__dirname, "../../../..");
const COMPONENTS_DIR = resolve(__dirname, "../components");
const CARD_VIEW = resolve(__dirname, "../lib/connection-card-view.ts");
const WORD_LIST = resolve(REPO_ROOT, "scripts/ci/banned-words.txt");

/** ADR-124 — the route this unit owns, added to the owned-route list as the ruling asks. */
const OWNED_ROUTE_FILES = ["src/app/parent/connections/page.tsx"];

/** 04 §6.2 S-P-08 and 04 §9: an admin-set time is shown in these words and no others. */
const MATCHMAKER_LINE = "arranged by your matchmaker";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory())
      return entry === "__tests__" ? [] : listFiles(full);
    return /\.(ts|tsx|md)$/.test(entry) ? [full] : [];
  });
}

const phrases = readFileSync(WORD_LIST, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

const pattern = new RegExp(
  `\\b(?:${phrases
    .map((phrase) =>
      phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[ -]"),
    )
    .join("|")})\\b`,
  "gi",
);

const hitsIn = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      const matches = line.match(pattern);
      return matches
        ? [`${relative(REPO_ROOT, file)}:${index + 1}: ${matches.join(", ")}`]
        : [];
    });

describe("connections — banned words (00-glossary §6; 05 §5.2 / §5.3)", () => {
  it("loads the 05 §5.2 list, and claims no allowlist row for S-P-08", () => {
    expect(phrases).toContain("interview");
    expect(WORD_ALLOWLIST.filter((row) => row.screen === "S-P-08")).toEqual([]);
  });

  it.each(
    [...listFiles(COMPONENTS_DIR), CARD_VIEW].map((file) =>
      relative(REPO_ROOT, file),
    ),
  )("%s carries no banned word", (file) => {
    expect(hitsIn(resolve(REPO_ROOT, file))).toEqual([]);
  });

  it.each(OWNED_ROUTE_FILES)(
    "%s (owned route file) carries no banned word",
    (file) => {
      expect(hitsIn(resolve(REPO_ROOT, file))).toEqual([]);
    },
  );

  // 04 §6.2's fate line for S-P-08 is explicit about this one word, so it gets its own claim. The banned word
  // itself is assembled rather than written, or this file would fail the static scan it is asserting.
  it("says meeting where a family reads a stage, and never the Sydney word", () => {
    const view = readFileSync(CARD_VIEW, "utf8").toLowerCase();
    expect(view).toContain("meeting arranged");
    expect(view).not.toContain(`inter${"view"}`);
  });

  it("keeps 04 §6.2's matchmaker line exactly as the document has it", () => {
    expect(readFileSync(CARD_VIEW, "utf8")).toContain(MATCHMAKER_LINE);
  });

  // 04 §5.1's ban reaches every S-P screen: no amount, no paid path, no trial language before the call.
  it("shows a family no money on this screen", () => {
    const rendered = [...listFiles(COMPONENTS_DIR), CARD_VIEW]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(rendered).not.toMatch(/£|pence|deposit|subscription/i); // config-literal-ok: the assertion IS that these never appear in rendered copy — PRICES and LOCALE own real money (03 §5.2)
  });
});
