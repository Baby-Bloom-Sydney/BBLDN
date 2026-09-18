// The `lint` job's config (05 §9 stage 1). JavaScript rather than JSON since P2-HARDEN, for one reason: the
// 50-line rule's exemption list carries a **reason per file**, and JSON with no comments cannot hold one inside
// an ESLint `overrides` entry. The list is its own file (`eslint.long-functions.json`) and is read here.
//
// ── REVIEW-3 R-4 — the 50-line rule gets a gate ────────────────────────────────────────────────────────────
// `common/coding-style.md` and 05 §7 rule 6 have said "functions ≤ 50 lines" since the first day of the build,
// and nothing enforced it: REVIEW-2 found eleven violations (M-11), REVIEW-3 found three more in one diff (M-4),
// and ADR-142 (2)'s own principle is that a rule with no gate reads as protection it is not. So it is an error
// now, with the files that were already over it recorded rather than refactored — a sweep would be a large,
// untested diff across surfaces four other units are working in, and the list shrinking as each file is next
// touched is the cheaper road to the same place.
//
// **Scope, and why it is not yet the whole repo.** The rule is on for `src/modules/**` and `src/boot/**` — the
// London tree this project writes. It is off for:
//   • tests — a `describe` block is a function and a long one is not a defect;
//   • the legacy Sydney tree (`eslint.legacy-paths.json`) and `src/app/**`, which F-d rewrites. Measured at the
//     landing: 609 files in `src/` have a function over 50 lines, of which 106 are in scope here. Turning the
//     rule on across the rest would be an exemption list five times longer than the code it protects, and would
//     bury the London entries this list exists to show.
// 05 §7 rule 6 wants it everywhere; F-d is where the rest of it joins.
const longFunctions = require("./eslint.long-functions.json");

module.exports = {
  extends: ["next/core-web-vitals", "next/typescript", "prettier"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "prefer-const": "warn",
  },
  overrides: [
    {
      files: ["src/modules/**/*.{ts,tsx}", "src/boot/**/*.{ts,tsx}"],
      excludedFiles: [
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
      ],
      rules: {
        "max-lines-per-function": [
          "error",
          { max: 50, skipBlankLines: true, skipComments: true },
        ],
      },
    },
    {
      // The recorded offenders. One entry per file, each with the reason it is here and the count it carried
      // when the rule landed; an entry comes out when the file is split, and the list is only ever shorter.
      files: Object.keys(longFunctions),
      rules: { "max-lines-per-function": "off" },
    },
  ],
};
