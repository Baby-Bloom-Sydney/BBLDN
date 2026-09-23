#!/usr/bin/env node
// check-gate-fixtures.mjs — ★ P4-GATES: drive every gate the other way, permanently.
//
// **The failure this exists to prevent.** A green gate is equally consistent with "the tree is clean" and
// with "the rule never ran" — and this repo has shipped the second twice (`3i` and `3j` both landed gates
// that passed vacuously until somebody drove them against a real violation). `lint:typed` being green
// therefore proves nothing on its own. This step is the other direction: it lints two fixture files with
// **the gate's own rule set object** (`scripts/boundaries/rules/typed-rule-set.js`, required by both, never
// copied) and asserts that
//
//   • `violations.fixture.ts` produces exactly the expected report per rule — each case a reconstruction of
//     the review finding that rule comes from, so the assertion is about a defect that really shipped; and
//   • `clean.fixture.ts` produces **nothing** — because a rule that also fires on the correct form is a tax,
//     and a tax is how a rule gets turned off six weeks later.
//
// Exact counts rather than "at least one": a rule silently narrowing its scope — an option flipped, a
// selector edited — keeps firing once and stops catching the case that matters. The count is the assertion.
//
// Exit 0 = every rule fires where it should and nowhere else; 1 = listed.
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const FIXTURES = resolve(HERE, "gate-fixtures");
const require_ = createRequire(import.meta.url);

// What `violations.fixture.ts` must report. One row per gated class; the comment names the finding.
const EXPECTED = {
  // REVIEW-2 C-2 — `await openDfyAccess(...)` discarded; a paid family's app could silently never open.
  "bb/no-discarded-result": 1,
  // REVIEW-2 H-9 — `void save(next, false)`; `void` suppressed the signal without attaching a handler.
  "@typescript-eslint/no-floating-promises": 1,
  // REVIEW-3 L-5 — `setTimeout(poll, ms)` with an async `poll`; the scheduler discards the promise.
  "@typescript-eslint/no-misused-promises": 1,
  // REVIEW-2 M-16 — a `default:` that re-narrows the discriminant instead of exhausting the union.
  "@typescript-eslint/switch-exhaustiveness-check": 1,
  // REVIEW-3 H-3 (`"" as never`, at its real nesting) and its `as any` sibling.
  "no-restricted-syntax": 2,
};

function fail(message) {
  console.error(`check-gate-fixtures: FAIL — ${message}`);
  process.exit(1);
}

let rules;
try {
  rules = require_(
    resolve(REPO_ROOT, "scripts/boundaries/rules/typed-rule-set.js"),
  );
} catch (error) {
  fail(
    `the gate's rule set could not be loaded (${error.message}). This check exists to lint the fixtures with the SAME object eslint.typed.js uses; without it there is nothing honest to assert.`,
  );
}

// The rule set and EXPECTED must name the same rules, both ways round.
//
// A rule the gate enables with no fixture case is a rule nobody has ever driven — the exact state this check
// exists to make impossible. A rule EXPECTED names that the gate no longer enables is the other direction:
// without that arm a removal reports as "the rule is not running", which is true but diagnoses the wrong
// thing and invites a tired reader to fix the fixture instead of noticing the gate shrank.
const unasserted = Object.keys(rules).filter((rule) => !(rule in EXPECTED));
if (unasserted.length > 0)
  fail(
    `eslint.typed.js enables ${unasserted.join(", ")}, which no fixture case drives. Add a violation to scripts/ci/gate-fixtures/violations.fixture.ts and its count to EXPECTED here — an undriven rule is a rule that may already be doing nothing.`,
  );

const dropped = Object.keys(EXPECTED).filter((rule) => !(rule in rules));
if (dropped.length > 0)
  fail(
    `EXPECTED names ${dropped.join(", ")}, which eslint.typed.js no longer enables. A gated class was removed: say so deliberately — take the rule out of EXPECTED and its case out of the fixture, in a commit that says why — rather than letting the fixture drift into asserting a rule that is gone.`,
  );

// Driven through the CLI with the flat config at `gate-fixtures/eslint.fixtures.js`, the same way
// `lint:boundaries` runs — ESLint 8's Node API takes eslintrc-shaped config, and linting the fixtures
// differently from the way the gate lints would prove something about the difference.
const run = spawnSync(
  process.execPath,
  [
    resolve(REPO_ROOT, "node_modules/eslint/bin/eslint.js"),
    "--config",
    "scripts/ci/gate-fixtures/eslint.fixtures.js",
    "--format",
    "json",
    "scripts/ci/gate-fixtures/violations.fixture.ts",
    "scripts/ci/gate-fixtures/clean.fixture.ts",
  ],
  {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, ESLINT_USE_FLAT_CONFIG: "true" },
  },
);

if (run.error || run.stdout === "")
  fail(
    `ESLint would not run over the fixtures (${run.error?.message ?? run.stderr.trim().split("\n").slice(-3).join(" | ")}). A check that cannot lint its own fixtures must not pass.`,
  );

let results;
try {
  results = JSON.parse(run.stdout);
} catch {
  fail(
    `ESLint's output over the fixtures was not JSON: ${run.stdout.slice(0, 300)}`,
  );
}

if (results.length !== 2)
  fail(
    `expected two fixture files to be linted, got ${results.length}. A glob that matches nothing reports nothing and passes — which is the vacuous-gate failure this check exists to prevent.`,
  );

const failures = [];
const counted = {};
let cleanReports = 0;

for (const result of results) {
  const name = relative(FIXTURES, result.filePath);
  for (const message of result.messages) {
    if (!message.ruleId) {
      failures.push(
        `${name}:${message.line} produced a non-rule report — "${message.message}". A fixture that will not parse or will not type-check proves nothing.`,
      );
      continue;
    }
    if (name === "clean.fixture.ts") {
      cleanReports += 1;
      failures.push(
        `clean.fixture.ts:${message.line} reported ${message.ruleId}. The correct form must lint clean — a rule that fires on the fix as well as the defect is a tax, and a tax is how a rule gets turned off.`,
      );
      continue;
    }
    counted[message.ruleId] = (counted[message.ruleId] ?? 0) + 1;
  }
}

for (const [rule, want] of Object.entries(EXPECTED)) {
  const got = counted[rule] ?? 0;
  if (got === want) continue;
  failures.push(
    got === 0
      ? `${rule} reported NOTHING against violations.fixture.ts, where ${want} was expected. The rule is not running — check the plugin wiring, the file glob, and that parserOptions.project reaches the fixture (a type-aware rule with no type information reports nothing and says nothing).`
      : `${rule} reported ${got} against violations.fixture.ts, where ${want} was expected. Either a case was added or removed without updating EXPECTED, or the rule's scope moved — a rule that narrows quietly keeps firing once and stops catching the case that matters.`,
  );
}

for (const rule of Object.keys(counted))
  if (!(rule in EXPECTED))
    failures.push(
      `${rule} reported against violations.fixture.ts and is not in EXPECTED. Record what it catches and how often.`,
    );

for (const message of failures)
  console.error(`check-gate-fixtures: FAIL — ${message}`);
if (failures.length > 0) process.exit(1);

const summary = Object.entries(EXPECTED)
  .map(([rule, n]) => `${rule.replace("@typescript-eslint/", "")} x${n}`)
  .join(" · ");
console.log(
  `check-gate-fixtures: OK — every gated rule fires on a real reconstructed defect (${summary}), and clean.fixture.ts reports ${cleanReports}`,
);
