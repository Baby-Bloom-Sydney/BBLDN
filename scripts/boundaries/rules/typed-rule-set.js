"use strict";

// The five type-aware rules, in one place, because two things consume them and a second copy is a second
// thing to drift: `eslint.typed.js` (the gate, over `src/modules/**` + `src/boot/**`) and
// `scripts/ci/check-gate-fixtures.mjs` (the proof that each one actually fires).
//
// That second consumer is the reason this file exists rather than an inline object. `3i` and `3j` both
// shipped gates that passed vacuously until somebody drove them against a real violation; a fixture suite
// that lints with a HAND-COPIED rule set proves something about the copy, not about the gate. Both read
// this.
//
// The reasoning for each rule — which review finding it comes from, how often that finding recurred, and
// why the options are what they are — is in `eslint.typed.js`'s header. It is not repeated here.

// `never` is assignable to every type, so `x as never` is strictly more permissive than `as unknown as`,
// and — the sharper half — it greps for nothing and no rule reads it.
//
// **The selector is any value position, and that is a correction this unit made by driving the gate the
// other way rather than by reasoning.** The brief named "an argument position", and
// `CallExpression > TSAsExpression` is the obvious way to write it. Measured against the fixture
// reconstructing REVIEW-3 H-3, it reported NOTHING: the real line is
// `capture({ …, mobile: me.mobile ?? ("" as never), … })`, where the cast sits inside an object property
// inside a `??`, two levels below the call. A gate that cannot catch the defect it was written for is the
// `3i` / `3j` failure exactly, and it would have shipped green. Any value position costs 84 recorded sites
// instead of 20 and cannot be dodged by wrapping the cast in anything.
//
// A cast in a TYPE position (`Foo<never>`, `x: never`) is not matched — `TSAsExpression` is the `as`
// operator only, which is the thing that launders a value.
const LAUNDERING_CASTS = [
  {
    selector: "TSAsExpression > TSNeverKeyword",
    message:
      "`as never` (REVIEW-2 M-12 — ten sites; REVIEW-3 H-3 — an invited nanny could never leave isolation, and no cast and no `any` was involved so nothing caught it). `never` is assignable to EVERY type, so this is strictly more permissive than `as unknown as` and it greps for nothing. Give the value a type the reader actually accepts, or change the contract that has no legal value to pass — H-3's fix was one word on a connector.",
  },
  {
    selector: "TSAsExpression > TSAnyKeyword",
    message:
      "`as any`. Narrow from `unknown` instead — a cast is exactly where an unchecked value becomes someone else's invariant. `.eslintrc.js` has `no-explicit-any` at WARN, and `next lint` passes on warnings, so nothing gated this; measured at the landing, the London tree has zero, which is what makes closing the door free.",
  },
];

module.exports = Object.freeze({
  "bb/no-discarded-result": "error",
  "@typescript-eslint/no-floating-promises": [
    "error",
    // `ignoreVoid: false` is load-bearing. REVIEW-2 H-9's defect WAS the `void`: it suppressed the lint
    // signal without attaching a handler, so a config that honours `void` passes the exact line the finding
    // is about. `ignoreIIFE: false` for the same reason.
    { ignoreVoid: false, ignoreIIFE: false },
  ],
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/switch-exhaustiveness-check": [
    "error",
    {
      // A `default` arm does NOT make a union switch exhaustive. That is the finding, not a side effect:
      // REVIEW-2 M-16's `default:` re-narrowed the discriminant with a lying cast, and a sixth `kind` would
      // have compiled silently and rendered a blank, unanswerable question.
      considerDefaultExhaustiveForUnions: false,
      requireDefaultForNonUnion: true,
    },
  ],
  "no-restricted-syntax": ["error", ...LAUNDERING_CASTS],
});
