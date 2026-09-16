// The copy claim as an executable test (ADR-120 rule 1; ADR-124): every surface `1a` renders passes the 05 §5.2
// word list, comments included, with **no** allowlist row — none of these screens carries a 05 §5.3 exception.
// Same matcher as `scripts/ci/banned-words-static.mjs` (whole word, case-insensitive, hyphen / space variants),
// so a phrase this suite passes cannot be one the static pre-check flags.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../../..");
const MODULE_DIR = resolve(__dirname, "..");
const WORD_LIST = resolve(REPO_ROOT, "scripts/ci/banned-words.txt");

// Sitemap weights use the framework's own `priority` field name; it is data, not a rendered word.
const NOT_A_SURFACE = new Set(["lib/build-sitemap.ts"]);

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

const hitsIn = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      const matches = line.match(pattern);
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
