#!/usr/bin/env node
// check-long-functions.mjs — ★ REVIEW-4 M-6 / §8 R-8: the 50-line allow-list becomes a **ratchet**.
//
// `.eslintrc.js` turns `max-lines-per-function` (50) on for `src/modules/**` and `src/boot/**`, and turns it off
// again for every file named in `eslint.long-functions.json`. That second override is a list of recorded
// offenders, and the comment above it says "the list is only ever shorter". Nothing enforced the sentence.
// Measured by the sweep: **106 entries when the rule landed (`fb9851c`), 109 one cycle later** — one removed by
// being split when touched, four added as "pre-gate". Both sibling allow-files (`check-limiter-call-sites.mjs`,
// `check-action-limits.mjs`) fail on a stale entry by design; this one silently kept a dead path for ever.
//
// **What this gate asserts**, in three parts, each of which the sweep found missing:
//
//   1. **Every entry names a file that exists.** A renamed or deleted path is a no-op `overrides` entry that
//      nothing can ever notice — the exact staleness the two sibling gates refuse.
//   2. **Every entry carries a reason.** A record without one is an exemption, and an exemption with no author
//      and no cause is how 106 becomes 109.
//   3. **The count may only fall.** `long-functions.ratchet.json` holds the ceiling. Above it the gate fails
//      because the list grew; BELOW it the gate also fails — and that is the ratchet, not pedantry: a shrink
//      that does not lower the ceiling leaves the room to grow back for free, which is precisely how the
//      list got from 106 to 109 without anyone deciding to let it.
//
// It does not re-run ESLint over the listed files: whether each still has a function over 50 lines is the `lint`
// job's question, and asking it twice in two ways is how two gates come to disagree. This one asks the question
// `lint` structurally cannot — about the SHAPE of the exemption list itself.
//
// Exit 0 = the list is honest and no longer than its ceiling; 1 = listed.
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const LIST_FILE = resolve(REPO_ROOT, "eslint.long-functions.json");
const RATCHET_FILE = resolve(HERE, "long-functions.ratchet.json");

function fail(message) {
  console.error(`check-long-functions: FAIL — ${message}`);
  process.exit(1);
}

let list;
try {
  list = JSON.parse(readFileSync(LIST_FILE, "utf8"));
} catch (error) {
  fail(
    `eslint.long-functions.json could not be read (${error.code ?? error.message}). A gate that cannot read its own subject must not pass.`,
  );
}
let ratchet;
try {
  ratchet = JSON.parse(readFileSync(RATCHET_FILE, "utf8"));
} catch (error) {
  fail(
    `scripts/ci/long-functions.ratchet.json could not be read (${error.code ?? error.message}). The ceiling is the gate; without it there is nothing to ratchet against.`,
  );
}

const entries = Object.entries(list);
const failures = [];

for (const [path, reason] of entries) {
  if (!existsSync(resolve(REPO_ROOT, path)))
    failures.push(
      `eslint.long-functions.json names "${path}", which does not exist. A renamed or deleted path is a silent no-op override — remove it.`,
    );
  if (typeof reason !== "string" || reason.trim() === "")
    failures.push(
      `eslint.long-functions.json's entry for "${path}" has no reason. Every recorded offender says why it is here and what it carried.`,
    );
}

const ceiling = ratchet.ceiling;
if (!Number.isInteger(ceiling) || ceiling < 0)
  fail(
    'long-functions.ratchet.json\'s "ceiling" is not a whole number. The ratchet is a count, not a mood.',
  );

if (entries.length > ceiling)
  failures.push(
    `eslint.long-functions.json has ${entries.length} entries and the ratchet stands at ${ceiling}. The list may only shrink (REVIEW-4 M-6): split the function, or — if a file genuinely cannot be touched in this unit — say so to the planner and move the ceiling deliberately, in its own commit, with a reason.`,
  );
else if (entries.length < ceiling)
  failures.push(
    `eslint.long-functions.json is down to ${entries.length} entries and the ratchet still stands at ${ceiling}. Lower "ceiling" to ${entries.length} in scripts/ci/long-functions.ratchet.json — an un-lowered ceiling is room to grow back for free, which is how 106 became 109.`,
  );

for (const message of failures)
  console.error(`check-long-functions: FAIL — ${message}`);
if (failures.length > 0) process.exit(1);

console.log(
  `check-long-functions: OK — ${entries.length} recorded offenders, all present and all with a reason; ratchet at ${ceiling}`,
);
