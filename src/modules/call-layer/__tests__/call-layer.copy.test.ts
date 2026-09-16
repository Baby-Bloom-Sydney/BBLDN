// The copy claim as an executable test (ADR-123 keeps ADR-120 rule 1; ADR-124): every screen `1d` renders passes
// the 05 §5.2 word list, comments and identifiers included, with the 05 §5.3 allowlist applied **exactly as
// written** — "Book my call" on S-P-01's action button only, once, and nowhere else (glossary §6 scoped
// exception; P-4). Same matcher as `scripts/ci/banned-words-static.mjs`. The module's `lib/` and `types.ts` carry
// the scheduling contract's own vocabulary (`Booking`, `book`) and are not rendered copy — the static check
// scans `types.ts` and the README and reports them under the accepted `banned-literals` red (ADR-124).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WORD_ALLOWLIST } from "../../../../tests/e2e/words/allowlist";

const REPO_ROOT = resolve(__dirname, "../../../..");
const COMPONENTS_DIR = resolve(__dirname, "../components");
const WORD_LIST = resolve(REPO_ROOT, "scripts/ci/banned-words.txt");

const OWNED_ROUTE_FILES = ["src/app/parent/call/page.tsx"];

/** S-P-02's button lives in this file; the allowlist row names S-P-01, the page it is a component of. */
const BUTTON_FILE = "src/modules/call-layer/components/SlotPicker.tsx";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listFiles(full);
    return /\.(ts|tsx|md)$/.test(entry) ? [full] : [];
  });
}

const phrases = readFileSync(WORD_LIST, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

const escape = (phrase: string) =>
  phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[ -]");

const pattern = new RegExp(`\\b(?:${phrases.map(escape).join("|")})\\b`, "gi");

const allowedPhrase = WORD_ALLOWLIST.find(
  (row): row is Extract<typeof row, { kind: "phrase" }> =>
    row.kind === "phrase" && row.screen === "S-P-01",
);

const surfaces = [
  ...listFiles(COMPONENTS_DIR),
  ...OWNED_ROUTE_FILES.map((file) => resolve(REPO_ROOT, file)),
];

const hitsIn = (file: string): string[] => {
  const allowed =
    allowedPhrase !== undefined && relative(REPO_ROOT, file) === BUTTON_FILE
      ? new RegExp(`^${escape(allowedPhrase.phrase)}$`, "i")
      : null;
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      const words = line.match(pattern) ?? [];
      // the exact allowlisted phrase on the button's own line is the one permitted occurrence
      const kept =
        allowed !== null && allowed.test(line.trim())
          ? words.filter(
              (word) =>
                !allowedPhrase!.phrase
                  .toLowerCase()
                  .includes(word.toLowerCase()),
            )
          : words;
      return kept.length > 0
        ? [`${relative(REPO_ROOT, file)}:${index + 1}: ${kept.join(", ")}`]
        : [];
    });
};

describe("call-layer — banned words (00-glossary §6; 05 §5.2 / §5.3)", () => {
  it("loads the 05 §5.2 list and the S-P-01 allowlist row", () => {
    expect(phrases).toContain("book");
    expect(phrases).toContain("within 24 hours");
    expect(allowedPhrase?.phrase).toBe("Book my call");
  });

  it.each(surfaces.map((file) => relative(REPO_ROOT, file)))(
    "%s carries no banned word outside the one allowlisted button",
    (file) => {
      expect(hitsIn(resolve(REPO_ROOT, file))).toEqual([]);
    },
  );

  it("uses the allowlisted phrase exactly once, as the button's own text, and nowhere else", () => {
    const source = readFileSync(resolve(REPO_ROOT, BUTTON_FILE), "utf8");
    const occurrences = source.match(/Book my call/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(source).toMatch(/<button[^>]*>\s*Book my call\s*<\/button>/);
    for (const file of surfaces) {
      if (relative(REPO_ROOT, file) === BUTTON_FILE) continue;
      expect(readFileSync(file, "utf8")).not.toMatch(/book my call/i);
    }
  });
});
