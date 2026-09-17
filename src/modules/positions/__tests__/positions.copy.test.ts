// The copy claim as an executable test (ADR-123 keeps ADR-120 rule 1; ADR-124): every surface `1e` renders —
// this module's files, comments and identifiers included, and the two route files it owns — passes the 05 §5.2
// word list with no allowlist row. Same matcher as `scripts/ci/banned-words-static.mjs`.
//
// The screens under test sit **before** the call, so the ban bites hardest here: no amount, no paid-path
// vocabulary, no "interview" for a meeting (04 §8; 00-glossary §6). S-P-04's header is the ratified line and is
// asserted by name so a reword cannot pass unnoticed.
//
// **Scope, as `1d` set it.** The rendered surfaces are `components/` and the owned route files. The module's
// `lib/` and `types.ts` carry the **stage contract's own vocabulary** — `job-not-named` (03 §2.5's error
// reason), `close-no-candidates` (a §2.5 `SystemJobName`) and `no_candidates` (a 02 §3 enum value) — which are
// code a parent never reads and cannot be reworded without changing the contract and the database. The static
// check scans them and reports them under the accepted `banned-literals` red (ADR-124).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WORD_ALLOWLIST } from "../../../../tests/e2e/words/allowlist";

const REPO_ROOT = resolve(__dirname, "../../../..");
const COMPONENTS_DIR = resolve(__dirname, "../components");
const WORD_LIST = resolve(REPO_ROOT, "scripts/ci/banned-words.txt");

/** ADR-124 — the routes this unit owns, added to the owned-route list as the ruling asks. */
const OWNED_ROUTE_FILES = [
  "src/app/parent/request/page.tsx",
  "src/app/parent/position/page.tsx",
];

const RATIFIED_HEADER = "Create your position to connect with nannies";

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

describe("positions — banned words (00-glossary §6; 05 §5.2 / §5.3)", () => {
  it("loads the 05 §5.2 list, and claims no allowlist row for any screen this unit owns", () => {
    expect(phrases).toContain("interview");
    expect(phrases).toContain("price");
    expect(
      WORD_ALLOWLIST.filter((row) => ["S-P-04", "S-P-05"].includes(row.screen)),
    ).toEqual([]);
  });

  it.each(listFiles(COMPONENTS_DIR).map((file) => relative(REPO_ROOT, file)))(
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

  it("keeps S-P-04's ratified header exactly as 04 §8 has it", () => {
    const route = readFileSync(
      resolve(REPO_ROOT, "src/app/parent/request/page.tsx"),
      "utf8",
    );
    expect(route).toContain(RATIFIED_HEADER);
  });
});
