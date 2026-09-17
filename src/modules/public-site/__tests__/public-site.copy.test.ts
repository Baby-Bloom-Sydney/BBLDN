// The copy claim as an executable test (ADR-120 rule 1; ADR-124): every surface `public-site` renders passes the
// 05 §5.2 word list, comments included. One screen carries a 05 §5.3 allowlist row — S-X-10's lead magnet
// "Try Free Matchmaking" (ADR-056) — and it is applied **by screen id from the allowlist file**, exactly as the
// rendered test applies it; every other file passes with no exception. Same matcher as
// `scripts/ci/banned-words-static.mjs` (whole word, case-insensitive, hyphen / space variants).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WORD_ALLOWLIST } from "../../../../tests/e2e/words/allowlist";

const REPO_ROOT = resolve(__dirname, "../../../..");
const MODULE_DIR = resolve(__dirname, "..");
const WORD_LIST = resolve(REPO_ROOT, "scripts/ci/banned-words.txt");

// Sitemap weights use the framework's own `priority` field name; it is data, not a rendered word.
const NOT_A_SURFACE = new Set(["lib/build-sitemap.ts"]);

/** The file that renders each allowlisted screen — the only files a 05 §5.3 phrase row may excuse. */
const SCREEN_OF_FILE: Readonly<Record<string, string>> = Object.freeze({
  "components/BrowseNannies.tsx": "S-X-10",
});

const OWNED_ROUTE_FILES = [
  "src/app/layout.tsx",
  "src/app/fonts.ts",
  "src/app/robots.ts",
  "src/app/sitemap.ts",
  "src/app/(public)/layout.tsx",
  "src/app/(public)/page.tsx",
  "src/app/(public)/about/page.tsx",
  "src/app/(public)/how-it-works/page.tsx",
  "src/app/(public)/pricing/page.tsx",
  "src/app/(public)/contact/page.tsx",
  "src/app/(public)/nannies/page.tsx",
  "src/app/(public)/nannies/[id]/page.tsx",
  "src/app/api/areas/route.ts",
  "src/app/api/og/nanny/[id]/route.tsx",
  // `1c` — the signup screens (S-X-05 · S-X-06 · S-X-08 · S-X-09) and the `(auth)` group chrome.
  "src/app/(auth)/layout.tsx",
  "src/app/(auth)/signup/page.tsx",
  "src/app/(auth)/signup/parent/page.tsx",
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/forgot-password/page.tsx",
  "src/app/(auth)/reset-password/page.tsx",
  "src/app/(funnel)/matchmaking/signup/page.tsx",
];

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

const moduleSurfaces = listFiles(MODULE_DIR).filter(
  (file) => !NOT_A_SURFACE.has(relative(MODULE_DIR, file)),
);
const routeSurfaces = OWNED_ROUTE_FILES.map((file) => resolve(REPO_ROOT, file));

const allowedPhrases = (file: string): ReadonlyArray<string> => {
  const screen = SCREEN_OF_FILE[relative(MODULE_DIR, file)];
  return WORD_ALLOWLIST.flatMap((row) =>
    row.kind === "phrase" && row.screen === screen ? [row.phrase] : [],
  );
};

const hitsIn = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      const cleaned = allowedPhrases(file).reduce(
        (text, phrase) => text.split(phrase).join(""),
        line,
      );
      const matches = cleaned.match(pattern);
      return matches
        ? [`${relative(REPO_ROOT, file)}:${index + 1}: ${matches.join(", ")}`]
        : [];
    });

describe("public-site — banned words (00-glossary §6; 05 §5.2)", () => {
  it("loads the 05 §5.2 list", () => {
    expect(phrases).toContain("book");
    expect(phrases).toContain("free");
    expect(phrases.length).toBeGreaterThan(40);
  });

  it.each(moduleSurfaces.map((file) => relative(REPO_ROOT, file)))(
    "%s carries no banned word",
    (file) => {
      expect(hitsIn(resolve(REPO_ROOT, file))).toEqual([]);
    },
  );

  it.each(routeSurfaces.map((file) => relative(REPO_ROOT, file)))(
    "%s (owned route file) carries no banned word",
    (file) => {
      expect(hitsIn(resolve(REPO_ROOT, file))).toEqual([]);
    },
  );
});
