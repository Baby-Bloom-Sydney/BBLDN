// The copy claim as an executable test (ADR-120 rule 1; ADR-124): every surface `matching` renders passes the
// 05 §5.2 word list, comments included, with no allowlist row. Same matcher as the static pre-check.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../../..");
const MODULE_DIR = resolve(__dirname, "..");
const WORD_LIST = resolve(REPO_ROOT, "scripts/ci/banned-words.txt");

const OWNED_ROUTE_FILES = [
  "src/app/(funnel)/results/page.tsx",
  "src/app/(funnel)/matchmaking/onboarding/page.tsx",
  "src/app/(funnel)/matchmaking/results/page.tsx",
  "src/app/api/public/quick-match/route.ts",
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

const hitsIn = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      const matches = line.match(pattern);
      return matches
        ? [`${relative(REPO_ROOT, file)}:${index + 1}: ${matches.join(", ")}`]
        : [];
    });

describe("matching — banned words (00-glossary §6; 05 §5.2)", () => {
  it.each(listFiles(MODULE_DIR).map((file) => relative(REPO_ROOT, file)))(
    "%s carries no banned word",
    (file) => {
      expect(hitsIn(resolve(REPO_ROOT, file))).toEqual([]);
    },
  );

  it.each(OWNED_ROUTE_FILES)(
    "%s (owned route file) carries no banned word",
    (file) => {
      expect(hitsIn(resolve(REPO_ROOT, file))).toEqual([]);
    },
  );
});
