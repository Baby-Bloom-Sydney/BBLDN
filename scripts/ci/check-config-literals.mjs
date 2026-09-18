#!/usr/bin/env node
// check-config-literals.mjs — the config-literal test (05 §6; 01 §3.2 rule 1; L4; AC-X-23). Fails on any brand /
// domain / sender / locale / price / flag / env / area-source / scheduling / access-term / supply-gate literal outside
// `src/modules/config/**`. Built-in exclusions are 05 §6's (generated types, *.d.ts, vercel.json, .env*, docs, README)
// plus this folder (the patterns live here). The legacy tree is excluded by the committed `literal-exclusions.json`
// (emptied by F-d — HANDOFF §7, §10 C2). `// config-literal-ok: <reason>` is the only inline escape; it is counted.
// `literal-exclusions.json` is shared with check-env-reads.mjs (src only); this check also scans tests/ + scripts/.
// Reports check `banned-literals` (HANDOFF §9). Exit 0 = clean; 1 = hits listed.
import { readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

// 05 §6 pattern table, verbatim in intent. Exported so `config.legal.test.ts` can prove the `jurisdiction` rule
// catches each fact it names — a gate nobody has driven is a claim, not a control (ADR-171).
export const RULES = [
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
  // Row `12.08` — a legal jurisdiction fact is `config` (ADR-171: `LEGAL`), never a literal. Case-sensitive on the
  // acronyms and the proper nouns on purpose: `wwcc` is added because that is how the AU check name travels in data,
  // but a bare city name is NOT here — ~40 London files say "Sydney's X is not carried" and reddening those would
  // have the rule deleted within a week. The `locale` rule above already owns `en-AU` / `AUD` / `A$` / `Australia/…`.
  {
    rule: "jurisdiction",
    pattern:
      /New South Wales|\bNSW\b|\.com\.au|Privacy Act 1988|\bOAIC\b|\bWWCC\b|\bwwcc\b|Fair Work|Australian Consumer Law|\bABN\b|\bACN\b|\+61/,
  },
  // ADR-172 — a safeguarding duty, threshold, agency or hotline never appears in code. `everywhere: true` is the
  // whole point of this entry: it is the one rule the parked legacy tree is **not** exempt from, because that tree
  // may hold stale marketing and may never hold a stale safety claim. `3d′` found `checkpoints.ts:147` telling a
  // user she was a mandatory reporter under NSW law and to ring an Australian number about a child at risk.
  //
  // The England-and-Wales names are banned here too, and that is deliberate rather than over-reach: the correct
  // route (who carries a duty, the threshold, local authority children's social care, the NSPCC line) is a
  // safeguarding and legal decision for BAI with a solicitor, and when it lands it belongs in a **versioned
  // document body** — `legal_documents`, seeded from SQL, outside these scan roots — never hardcoded in a
  // component, an email template or a PDF. Typing a reporting route into code is exactly how the NSW one shipped.
  //
  // **Not here: `Service NSW`.** It is the NSW transaction portal, not a reporting agency — ADR-172's class is the
  // agency, hotline, duty and threshold of a *report*. Putting it here would redden the legacy WWCC apply link and
  // the WWCC evidence error message, which are F-d's data-model surfaces (`3d′`'s bucket (b)), and a safety rule
  // that drags unrelated legacy copy with it is a rule that gets escaped. `WWCC` stays with the `jurisdiction` rule.
  //
  // The emergency numbers match only next to an instruction verb and never with a digit or comma against them, so
  // `A$1,000`, `?? 999` and `20 000` stay green. A bare "Child Protection" (the training certificate nannies hold)
  // is deliberately absent; only "Child Protection Helpline" is here.
  {
    rule: "safeguarding",
    everywhere: true,
    pattern: new RegExp(
      [
        "mandatory report(?:er|ers|ing)", // the duty, stated as a duty
        "Reportable Conduct", // the NSW parallel scheme
        "Risk of Significant Harm", // the threshold, spelled out
        "\\bROSH\\b", // the threshold, abbreviated
        "Child Protection Helpline",
        "\\bDCJ\\b",
        "Department of Communities and Justice",
        "\\bNSPCC\\b",
        "\\bChild\\s?line\\b",
        "children[\\u2019']?s social care",
        "\\b132\\s?111\\b",
        "\\b1800\\s?55\\s?1800\\b",
        // An emergency number given as the thing to ring. The guards around the digits exclude only a number
        // the digits are PART OF — a digit against them, or a comma/period that is itself against a digit
        // (`A$1,000`, `20 000`, `?? 999`). They deliberately do NOT exclude ordinary punctuation between the
        // instruction and the number (`call, 999`, `ext.999`), which an earlier `(?<![\\d,.])` did: the
        // security pass measured that a real instruction one comma away slipped through the one rule the
        // parked tree is not exempt from.
        "\\b(?:call|dial|phone|ring|contact)\\b[^\\n]{0,30}(?<!\\d)(?<!\\d[,.])(?:000|999|112)\\b(?!\\d)(?![,.]\\d)",
      ].join("|"),
      "i",
    ),
  },
];

/** The rules that bite inside `literal-exclusions.json`'s parked legacy tree as well (ADR-172). */
const EVERYWHERE_RULES = RULES.filter((rule) => rule.everywhere === true);

function relPath(file) {
  return relative(REPO_ROOT, file).split("\\").join("/");
}

function scanFile(file, rules) {
  const lines = readFileSync(file, "utf8").split("\n");
  const hits = [];
  let escapes = 0;
  lines.forEach((line, index) => {
    const matched = rules
      .filter(({ pattern }) => pattern.test(line))
      .map(({ rule }) => rule);
    if (matched.length === 0) return;
    if (ESCAPE.test(line)) {
      escapes += 1;
      return;
    }
    hits.push(
      `${relPath(file)}:${index + 1}: [${[...new Set(matched)].join(", ")}] ${line.trim().slice(0, 120)}`,
    );
  });
  return { hits, escapes };
}

const isLegacyExcluded = loadExclusions(
  resolve(REPO_ROOT, "literal-exclusions.json"),
);
const isBuiltInExcluded = (path) =>
  BUILT_IN_EXCLUSIONS.some((pattern) => pattern.test(path));

/**
 * One pass over the tree. Two populations, because ADR-172 carved one rule out of the parked-legacy exemption:
 *   `filesScanned`            — not excluded at all; every rule applies.
 *   `everywhereFilesScanned`  — parked legacy; only `EVERYWHERE_RULES` apply.
 * Built-in exclusions (generated types, docs, and this folder, where the patterns themselves live) are exempt from
 * both — a rule that reddened its own source would be unwritable.
 * Exported so the tests can drive the gate rather than take its word (ADR-171's reason, applied again).
 */
export function scanRepo() {
  const all = SCAN_ROOTS.flatMap((root) =>
    listFiles(resolve(REPO_ROOT, root), { extensions: SOURCE_EXTENSIONS }),
  ).filter((file) => !isBuiltInExcluded(relPath(file)));
  const full = all.filter((file) => !isLegacyExcluded(relPath(file)));
  const parked = all.filter((file) => isLegacyExcluded(relPath(file)));

  const results = [
    ...full.map((file) => scanFile(file, RULES)),
    ...parked.map((file) => scanFile(file, EVERYWHERE_RULES)),
  ];
  return {
    hits: results.flatMap((result) => result.hits),
    escapes: results.reduce((sum, result) => sum + result.escapes, 0),
    filesScanned: full.length,
    everywhereFilesScanned: parked.length,
  };
}

function main() {
  const { hits, escapes, filesScanned, everywhereFilesScanned } = scanRepo();
  if (filesScanned === 0) {
    console.error(
      "check-config-literals: FAIL — scanned zero files; the scan roots or the exclusions are wrong",
    );
    process.exit(1);
  }
  if (hits.length > 0) {
    console.error(
      `check-config-literals: FAIL — ${hits.length} literal(s) outside src/modules/config on ${filesScanned} file(s) (+${everywhereFilesScanned} parked file(s) scanned for safeguarding only); ${escapes} inline escape(s)`,
    );
    for (const hit of hits) console.error(`  ${hit}`);
    process.exit(1);
  }
  console.log(
    `check-config-literals: OK — ${filesScanned} file(s) scanned, +${everywhereFilesScanned} parked file(s) scanned for safeguarding only (ADR-172), 0 hits, ${escapes} inline escape(s) (config-literal-ok)`,
  );
}

// Importing this module must not run the scan and must never call `process.exit` — `config.legal.test.ts` and
// `config.safeguarding-literals.test.ts` import `RULES` / `scanRepo`, and a top-level failure would abort the whole
// vitest process with exit 1 instead of reporting a failing test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
