// The copy claim as an executable test (ADR-120 rule 1; ADR-124): every surface `1c` renders — the module's own
// files, comments included, and the route files it owns — passes the 05 §5.2 word list with no allowlist row.
// Same matcher as `scripts/ci/banned-words-static.mjs` and 1a's `public-site.copy.test.ts`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SIGNUP_COPY } from "../lib/signup-copy";

const REPO_ROOT = resolve(__dirname, "../../../..");
const MODULE_DIR = resolve(__dirname, "..");
const WORD_LIST = resolve(REPO_ROOT, "scripts/ci/banned-words.txt");

const OWNED_ROUTE_FILES = [
  "src/app/(auth)/layout.tsx",
  "src/app/(auth)/signup/page.tsx",
  "src/app/(auth)/signup/parent/page.tsx",
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/forgot-password/page.tsx",
  "src/app/(auth)/reset-password/page.tsx",
  "src/app/(funnel)/matchmaking/signup/page.tsx",
  "src/app/api/auth/callback/route.ts",
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

const surfaces = [
  ...listFiles(MODULE_DIR),
  ...OWNED_ROUTE_FILES.map((file) => resolve(REPO_ROOT, file)),
];

const hitsIn = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      const matches = line.match(pattern);
      return matches
        ? [`${relative(REPO_ROOT, file)}:${index + 1}: ${matches.join(", ")}`]
        : [];
    });

describe("onboarding-parent — banned words (00-glossary §6; 05 §5.2)", () => {
  it("uses 04 §8's promise line as written, not a paraphrase", () => {
    expect(SIGNUP_COPY.promiseLine).toBe(
      "Your matchmaker will call to introduce you to your top nannies.",
    );
  });

  it.each(surfaces.map((file) => relative(REPO_ROOT, file)))(
    "%s carries no banned word",
    (file) => {
      expect(hitsIn(resolve(REPO_ROOT, file))).toEqual([]);
    },
  );
});
