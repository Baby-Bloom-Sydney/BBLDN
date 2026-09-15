#!/usr/bin/env node
// banned-words-static.mjs — fast lint-stage pre-check for 05 §5 (banned words).
// Scans the parent-facing source surfaces 05 §5 names; whole-word, case-insensitive,
// hyphen/space variants. It may FLAG; only the rendered Playwright test (`words.banned`)
// may PASS a phrase — the allowlist (05 §5.3) applies there, not here.
// Reports check `banned-literals` (HANDOFF §9). Exit 0 = no hits; 1 = hits listed.
import { readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./lib/list-files.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORD_LIST = resolve(REPO_ROOT, "scripts/ci/banned-words.txt");
// Surfaces from 05 §5 (absent paths are skipped).
const SURFACES = [
  "src/modules",
  "src/app/(public)",
  "src/app/(funnel)",
  "src/app/(auth)",
  "src/app/parent",
];
const SCAN_EXTENSIONS = [".ts", ".tsx", ".md", ".mdx"];
// Module insides are not rendered copy; tests are not surfaces.
const EXCLUDED_SEGMENTS = ["/__tests__/", "/lib/", "/actions/"];
const EXCLUDED_SUFFIXES = [".test.ts", ".test.tsx"];

function loadPhrases() {
  return readFileSync(WORD_LIST, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

function buildPattern(phrases) {
  const escaped = phrases.map((phrase) =>
    phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[ -]"),
  );
  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi");
}

function isSurfaceFile(file) {
  return (
    !EXCLUDED_SEGMENTS.some((segment) => file.includes(segment)) &&
    !EXCLUDED_SUFFIXES.some((suffix) => file.endsWith(suffix))
  );
}

function findHits(file, pattern) {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      const matches = line.match(pattern);
      return matches
        ? [
            `${relative(REPO_ROOT, file)}:${index + 1}: ${[...new Set(matches)].join(", ")}`,
          ]
        : [];
    });
}

const pattern = buildPattern(loadPhrases());
const files = SURFACES.flatMap((surface) =>
  listFiles(resolve(REPO_ROOT, surface), { extensions: SCAN_EXTENSIONS }),
).filter(isSurfaceFile);
if (files.length === 0) {
  console.log(
    "banned-words-static: OK — no parent-facing surfaces present yet",
  );
  process.exit(0);
}
const hits = files.flatMap((file) => findHits(file, pattern));
if (hits.length > 0) {
  console.error(
    `banned-words-static: FAIL — ${hits.length} line(s) with banned words; fix the copy or add a 05 §5.3 allowlist row with its ruling`,
  );
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(
  `banned-words-static: OK — no banned words on ${files.length} static surface file(s)`,
);
