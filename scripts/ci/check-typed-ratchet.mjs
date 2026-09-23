#!/usr/bin/env node
// check-typed-ratchet.mjs — ★ P4-GATES: `eslint.typed-ratchet.json` is a RATCHET, not a drawer.
//
// `eslint.typed.js` turns five type-aware rules on for `src/modules/**` and `src/boot/**`, and turns named
// rules off again per file for the offenders that existed when the gate landed. That second list is the
// place a gate quietly dies: REVIEW-4 M-6 measured the 50-line allow-list growing 106 -> 109 in a single
// cycle, with four of the recorded offenders being code that same range had just written and added as
// "pre-gate". The lesson is not "people cheat" — one entry left the list in that cycle by being split when
// touched, which is the mechanism working. It is that **a list with no direction of travel has none**.
//
// This gate is the sibling of `check-long-functions.mjs` and asserts the same three things, plus one more
// the finer per-rule shape makes possible:
//
//   1. **Every entry names a file that exists.** A renamed or deleted path is a no-op exemption nothing can
//      ever notice — the staleness both limiter allow-files refuse by design.
//   2. **Every entry carries a reason.** A record without one is an exemption, and an exemption with no
//      cause is how a ratchet becomes a drawer.
//   3. **Every entry names only rules the config actually enables.** A typo'd rule name silently exempts
//      nothing, so the file looks recorded and is in fact gated — or, worse, reads as covered when the rule
//      it meant to name is live. Either way the list is lying, and the list is the thing this gate protects.
//   4. **The count may only fall.** `typed-ratchet.ratchet.json` holds the ceiling, counted in **rule
//      entries** rather than files, because a file with three recorded rules is three exemptions. Above the
//      ceiling the gate fails because the list grew; BELOW it the gate also fails, and that is the ratchet
//      rather than pedantry — a shrink that does not lower the ceiling leaves the room to grow back for
//      free, which is exactly how 106 became 109 without anyone deciding to allow it.
//
// It does not re-run ESLint over the listed files. Whether each still violates its recorded rules is the
// `lint:typed` step's question, and asking it twice in two ways is how two gates come to disagree
// (`check-long-functions.mjs` states the same principle). This one asks the question `lint:typed`
// structurally cannot: about the SHAPE of the exemption list itself.
//
// Exit 0 = the list is honest and no longer than its ceiling; 1 = listed.
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const LIST_FILE = resolve(REPO_ROOT, "eslint.typed-ratchet.json");
const RATCHET_FILE = resolve(HERE, "typed-ratchet.ratchet.json");
const CONFIG_FILE = resolve(REPO_ROOT, "eslint.typed.js");

function fail(message) {
  console.error(`check-typed-ratchet: FAIL — ${message}`);
  process.exit(1);
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(
      `${what} could not be read (${error.code ?? error.message}). A gate that cannot read its own subject must not pass.`,
    );
  }
}

const list = readJson(LIST_FILE, "eslint.typed-ratchet.json");
const ratchet = readJson(RATCHET_FILE, "scripts/ci/typed-ratchet.ratchet.json");

if (typeof list.files !== "object" || list.files === null)
  fail(
    'eslint.typed-ratchet.json has no "files" object. The shape is { "files": { "<path>": { "rules": [...], "reason": "..." } } }.',
  );

// The set of rules the config actually turns on, read from the config rather than restated here — a second
// copy of the rule names is a second thing to drift (05 §10's own principle for the boundary table).
let enabledRules;
try {
  const require_ = createRequire(import.meta.url);
  const blocks = require_(CONFIG_FILE);
  enabledRules = new Set(Object.keys(blocks[0]?.rules ?? {}));
} catch (error) {
  fail(
    `eslint.typed.js could not be loaded (${error.message}). The ratchet is checked against the config's own rule names; without them there is nothing to check against.`,
  );
}
if (enabledRules.size === 0)
  fail(
    "eslint.typed.js's first block enables no rules. Either the config was gutted or this gate is reading the wrong block — both are failures.",
  );

const entries = Object.entries(list.files);
const failures = [];
let ruleEntries = 0;

for (const [path, entry] of entries) {
  if (!existsSync(resolve(REPO_ROOT, path)))
    failures.push(
      `"${path}" does not exist. A renamed or deleted path is a silent no-op exemption — remove the entry.`,
    );

  if (typeof entry?.reason !== "string" || entry.reason.trim() === "")
    failures.push(
      `"${path}" has no reason. Every recorded offender says why it is here and what it carried.`,
    );

  if (!Array.isArray(entry?.rules) || entry.rules.length === 0) {
    failures.push(
      `"${path}" names no rules. A file-wide exemption is not available here: say which rules, or fix the file.`,
    );
    continue;
  }

  ruleEntries += entry.rules.length;
  for (const rule of entry.rules)
    if (!enabledRules.has(rule))
      failures.push(
        `"${path}" exempts "${rule}", which eslint.typed.js does not enable. Either the name is a typo — in which case this entry silently exempts nothing and the file's real violation is unrecorded — or the rule was removed and the entry is dead. Both are stale.`,
      );
}

const ceiling = ratchet.ceiling;
if (!Number.isInteger(ceiling) || ceiling < 0)
  fail(
    'typed-ratchet.ratchet.json\'s "ceiling" is not a whole number. The ratchet is a count, not a mood.',
  );

if (ruleEntries > ceiling)
  failures.push(
    `eslint.typed-ratchet.json carries ${ruleEntries} rule entries and the ratchet stands at ${ceiling}. The list may only shrink: fix the violation rather than record it. If a file genuinely cannot be touched in this unit, say so to the planner and move the ceiling deliberately, in its own commit, with a reason.`,
  );
else if (ruleEntries < ceiling)
  failures.push(
    `eslint.typed-ratchet.json is down to ${ruleEntries} rule entries and the ratchet still stands at ${ceiling}. Lower "ceiling" to ${ruleEntries} in scripts/ci/typed-ratchet.ratchet.json — an un-lowered ceiling is room to grow back for free, which is how the 50-line list went 106 -> 109 (REVIEW-4 M-6).`,
  );

for (const message of failures)
  console.error(`check-typed-ratchet: FAIL — ${message}`);
if (failures.length > 0) process.exit(1);

console.log(
  `check-typed-ratchet: OK — ${entries.length} recorded files / ${ruleEntries} rule entries, all present, all with a reason, all naming live rules; ratchet at ${ceiling}`,
);
