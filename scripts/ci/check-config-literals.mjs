#!/usr/bin/env node
// check-config-literals.mjs — the config-literal test (05 §6; 01 §3.2 rule 1; L4; AC-X-23). Fails on any brand /
// domain / sender / locale / price / flag / env / area-source / scheduling / access-term / supply-gate literal outside
// `src/modules/config/**`. Built-in exclusions are 05 §6's (generated types, *.d.ts, vercel.json, .env*, docs, README)
// plus this folder (the patterns live here). The legacy tree is excluded by the committed `literal-exclusions.json`
// (emptied by F-d — HANDOFF §7, §10 C2). `// config-literal-ok: <reason>` is the only inline escape; it is counted.
// Reports check `banned-literals` (HANDOFF §9). Exit 0 = clean; 1 = hits listed.
import { readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./lib/list-files.mjs";
import { loadExclusions } from "./lib/load-exclusions.mjs";
import { globToRegExp } from "./lib/glob-to-regexp.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCAN_ROOTS = ["src", "tests", "scripts"];
const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".cjs",
];
const BUILT_IN_EXCLUSIONS = [
  "src/modules/config/**",
  "src/modules/shared-types/database.types.ts",
  "**/*.d.ts",
  "docs/**",
  "scripts/ci/**",
].map(globToRegExp);
const ESCAPE = /\/\/\s*config-literal-ok:\s*\S/;

// Same-line proximity: `a` within 40 characters of `b`, either order.
const near = (a, b) =>
  new RegExp(`(?:${a})[^\\n]{0,40}(?:${b})|(?:${b})[^\\n]{0,40}(?:${a})`, "i");

// 05 §6 pattern table, verbatim in intent.
const RULES = [
  { rule: "brand", pattern: /BabyBloom|Baby Bloom|babybloom/i },
  {
    rule: "domain",
    pattern: /babybloomlondon|babybloomsydney|https?:\/\/[a-z0-9.-]*babybloom/i,
  },
  { rule: "senders", pattern: /\b(noreply|hello|support|admin)@/i },
  {
    rule: "locale",
    pattern:
      /en-GB|en-AU|Europe\/London|Australia\/Sydney|\bGBP\b|\bAUD\b|£|A\$|phoneCountry\s*[:=]\s*['"]|\+44/i,
  },
  {
    rule: "prices",
    pattern: /Pence\s*[:=]\s*\d|trialDays\s*[:=]\s*\d|price_[A-Za-z0-9]{8,}/,
  },
  {
    rule: "flags",
    pattern:
      /\b(KATIE_ENABLED|NEXT_PUBLIC_KATIE_ENABLED|INVITE_LINKS_ENABLED|NEW_TRIALS_ENABLED|PAYMENTS_ENABLED|BONUS_PROGRAM_ENABLED|NEXT_PUBLIC_BONUS_PROGRAM_ENABLED|PROACTIVE_ENABLED|NEXT_PUBLIC_DEV_MODE|EMAIL_DEV_DRY_RUN|KATIE_STREAM_DIAGNOSTICS|KATIE_PRELOAD_PASSTHROUGH_ENABLED|KATIE_PARALLEL_TOOLS_ENABLED|KATIE_IMAGE_MARKER_ENABLED|KATIE_ALWAYS_ON_CONTEXT_ENABLED|NEXT_PUBLIC_KATIE_TYPEWRITER_ENABLED|NEXT_PUBLIC_SKIP_INTRO_WAIT|NEXT_PUBLIC_FUNNEL_LOG)\b/,
  },
  { rule: "env", pattern: /process\.env/ },
  {
    rule: "area source",
    pattern: /"Greater London"|'Greater London'|london_areas|sydney_postcodes/i,
  },
  {
    rule: "scheduling",
    pattern:
      /\b(slotMinutes|horizonDays|leadTimeMinutes|holdTtlSeconds|reminderOffsetsMinutes|overdueGraceMinutes|maxDisplacementsPerNannyPerDay|maxNoAnswerRetries)\s*[:=]\s*\d/,
  },
  { rule: "scheduling", pattern: near("rule|slot", "09:00|19:00") },
  { rule: "scheduling", pattern: near("call", "24\\s*h(?:ours)?\\b") },
  { rule: "scheduling", pattern: /(^|["'`\s])(\*\/)?\d+ \d+ \* \* [*\d]/ },
  {
    rule: "access term",
    pattern: near("access|birthday|until", "\\b3\\s*(?:y|yr|years)\\b"),
  },
  { rule: "supply gate", pattern: near("nann", "\\b25\\b") },
];

function relPath(file) {
  return relative(REPO_ROOT, file).split("\\").join("/");
}

function scanFile(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  const hits = [];
  let escapes = 0;
  lines.forEach((line, index) => {
    const rules = RULES.filter(({ pattern }) => pattern.test(line)).map(
      ({ rule }) => rule,
    );
    if (rules.length === 0) return;
    if (ESCAPE.test(line)) {
      escapes += 1;
      return;
    }
    hits.push(
      `${relPath(file)}:${index + 1}: [${[...new Set(rules)].join(", ")}] ${line.trim().slice(0, 120)}`,
    );
  });
  return { hits, escapes };
}

const isLegacyExcluded = loadExclusions(
  resolve(REPO_ROOT, "literal-exclusions.json"),
);
const isExcluded = (file) => {
  const path = relPath(file);
  return (
    BUILT_IN_EXCLUSIONS.some((pattern) => pattern.test(path)) ||
    isLegacyExcluded(path)
  );
};

const files = SCAN_ROOTS.flatMap((root) =>
  listFiles(resolve(REPO_ROOT, root), { extensions: SOURCE_EXTENSIONS }),
).filter((file) => !isExcluded(file));
const results = files.map(scanFile);
const hits = results.flatMap((result) => result.hits);
const escapes = results.reduce((sum, result) => sum + result.escapes, 0);

if (hits.length > 0) {
  console.error(
    `check-config-literals: FAIL — ${hits.length} literal(s) outside src/modules/config on ${files.length} file(s); ${escapes} inline escape(s)`,
  );
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(
  `check-config-literals: OK — ${files.length} file(s) scanned, 0 hits, ${escapes} inline escape(s) (config-literal-ok)`,
);
