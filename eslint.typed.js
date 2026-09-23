// eslint.typed.js — the type-aware half of stage 1, and the place the review record's recurring defect
// classes become checks rather than prose.
//
// ── Why a second config ────────────────────────────────────────────────────────────────────────────────────
// `.eslintrc.js` runs through `next lint` over the whole tree with no `parserOptions.project`, so every rule
// there is syntax-only. The four classes below cannot be decided without asking the type checker what a value
// is. Rather than putting the legacy Sydney tree (`src/lib`, `src/components`) under a type-aware program —
// which would be a flood, and which F-d rewrites anyway — this file mirrors the arrangement `lint:boundaries`
// already established: its own flat config, its own npm script, its own step in the `lint` job. Scope is the
// London tree, non-test, exactly the scope the 50-line rule chose and for the same reason.
//
// Measured: 7 s over 500-odd files. Type-aware linting is affordable here.
//
// ── What is gated, and why these four and not others (P4-GATES) ────────────────────────────────────────────
// ECC-lite moved review work into the pipeline, which makes "the batteries used to catch this" a claim the
// pipeline has to make true. The classes below were chosen by COUNTING recurrences across the three
// checkpoint sweeps (`docs/review-sweep-170926.md`, `-180926.md`, `-190926.md`), not by judgement about what
// sounds dangerous. A class had to be (a) repeated and (b) mechanically decidable. Counts, and the findings:
//
//   1. **A discarded `Result`** — 15+ findings, the most-repeated class in the record, and the one that
//      produced a CRITICAL. REVIEW-2 C-2 (`await deps.openDfyAccess({…})`: a paid family's app could silently
//      never open), REVIEW-2 M-13, REVIEW-4 H-1, and a dozen below. `bb/no-discarded-result`, written here
//      because nothing off the shelf reads this repo's own `Result` (01 §4a). See the rule for what it
//      deliberately does NOT claim.
//   2. **A floating promise** — REVIEW-2 H-9 (`void save(next, false)` turned a rejected server action into
//      an unhandled rejection) and REVIEW-3 L-5 (`void poll()`, still open at this commit and caught here).
//      `no-floating-promises` with **`ignoreVoid: false`**, which is the whole point: H-9's defect was that
//      `void` suppressed the signal without attaching a handler, so a config that honours `void` would have
//      passed the exact line the finding is about. `no-misused-promises` is its sibling for the JSX half.
//   3. **A `default:` that re-narrows a discriminated union instead of exhausting it** — REVIEW-2 M-16
//      (a sixth `kind` would render a blank, unanswerable question), REVIEW-2 L-3, REVIEW-3 L-4.
//      `switch-exhaustiveness-check` with `considerDefaultExhaustiveForUnions: false`, because a `default`
//      arm is precisely what those three findings had.
//   4. **`as never` / `as any` at an argument position** — REVIEW-2 M-12 (ten sites), REVIEW-3 H-3 (`"" as
//      never` — an invited nanny could never leave isolation, a shipped defect), REVIEW-3 M-8, M-11.
//      `never` is assignable to every type, so this is strictly more permissive than `as unknown as` and it
//      greps for nothing. Argument position is where both shipped defects lived; a bare `as never` in a
//      return or a binding is 64 further sites and a separate, wider decision.
//
// **Deliberately NOT gated**, and the reasoning is in the P4-GATES report: a refusal rendered as an absence
// (`links.ok ? … : []`, `if (!x.ok) return null`) is the same finding class and the commonest single shape —
// but REVIEW-2 H-9 and REVIEW-3 H-2 both concluded that swallowing a particular refusal was RIGHT and the
// defect was only that nobody said so. That is a judgement a gate cannot make. `noUncheckedIndexedAccess`
// (REVIEW-2 M-17) appeared once in three sweeps and is a compiler flag, not a lint rule: measured at 677
// errors repo-wide / 28 in the London tree, it is its own unit, scoped in the report.
//
// ── The ratchet ───────────────────────────────────────────────────────────────────────────────────────────
// Files that already violate a rule are listed in `eslint.typed-ratchet.json`, per file and per rule, each
// with a reason — never a blanket exemption and never a silent `eslint-disable`. `check:typed-ratchet`
// enforces that the list only ever shrinks, the same way `check:long-functions` does for the 50-line rule.
//
// Run: `npm run lint:typed` (CI: the `lint` job). `npm run check:gate-fixtures` proves each rule above
// actually fires — every one of them was driven against a real violation before it was trusted.
"use strict";

const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const bb = require("./scripts/boundaries/rules");
const ratchet = require("./eslint.typed-ratchet.json");

const IN_SCOPE = ["src/modules/**/*.{ts,tsx}", "src/boot/**/*.{ts,tsx}"];

// Tests are out of scope for the same reason the 50-line rule exempts them: a suite deliberately builds
// malformed values and deliberately ignores answers, and a fixture that cannot express a violation is no
// longer a fixture.
const NOT_TESTS = [
  "**/__tests__/**",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
];

const LANGUAGE_OPTIONS = {
  parser: tsParser,
  ecmaVersion: 2022,
  sourceType: "module",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    ecmaFeatures: { jsx: true },
  },
};

const PLUGINS = { "@typescript-eslint": tsPlugin, bb };

// The five rules live in `scripts/boundaries/rules/typed-rule-set.js`, not inline, because
// `check:gate-fixtures` lints against the same object to prove each one fires. A fixture suite that lints
// with a hand-copied rule set proves something about the copy, not about the gate.
const RULES = require("./scripts/boundaries/rules/typed-rule-set");

// The recorded offenders, per file and per rule. An entry turns off exactly the rules it names for exactly
// the file it names — the 50-line list turns the whole rule off per file, which is coarser than it needs to
// be, and this one does not repeat that. `check:typed-ratchet` holds the list honest and shrinking.
const ratchetBlocks = Object.entries(ratchet.files).map(([file, entry]) => ({
  files: [file],
  rules: Object.fromEntries(entry.rules.map((rule) => [rule, "off"])),
}));

module.exports = [
  {
    files: IN_SCOPE,
    ignores: NOT_TESTS,
    languageOptions: LANGUAGE_OPTIONS,
    plugins: PLUGINS,
    // Off deliberately. Two configs lint these files (`next lint` and this one) and a directive used by the
    // other run looks unused to this one — measured: four false reports on `eslint-disable-next-line
    // @typescript-eslint/no-empty-object-type`. A gate that invents findings is worse than one that misses.
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: RULES,
  },
  ...ratchetBlocks,
];
