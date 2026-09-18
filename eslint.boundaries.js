// eslint.boundaries.js — GENERATED FILE, DO NOT EDIT.
//
// Written by `scripts/gen-boundary-rules.ts` from the allowed-imports table of `01-architecture.md` §2.3
// (machine-readable copy: `scripts/boundaries/allowed-imports.ts`, proved equal to the document by
// `scripts/boundaries/__tests__/parse-architecture-table.test.ts`). A hand edit is a review failure
// (`05-acceptance-and-test-plan.md` §10): change the document, then the copy, then run
// `npm run gen:boundary-rules` and commit the result. CI diffs this file against a fresh generation.
//
// What it enforces over `src/modules/**` (05 §7):
//   rule 1  the arrows of 01 §2.3 — every `@/modules/<x>` not in a module's row is forbidden; `config` and
//           `shared-types` are allowed everywhere; the four service modules (01 §2.4) are allowed for every
//           business module and import no business module themselves.
//   rule 2  no deep imports — a module is entered through its connector only. `@/modules/config/server` is
//           `config`'s second entry point (01 §3.3). Sub-module connectors (`comms/sms`, `admin/*` …) are
//           reachable only through the parent's re-exports. `bb/no-relative-module-escape` closes the same
//           hole for relative paths and `bb/no-dynamic-module-import` the one for `import()` expressions
//           and type-position imports — neither of which ESLint 8's core rule reads.
//   rule 3  no cycles at module level — asserted over the declared table when this file is generated, which
//           is exhaustive once rules 1–2 hold (there is no other way for one module to reach another).
//   rule 4  `bb/one-export-per-file` — L1; the exemptions live in the rule, not in the files.
//
// Plus `bb/no-interpolated-log-message`: the S3 security review's second line of defence behind the runtime
// scrubber (01 §4b — identifiers go in `fields`, never in the message).
//
// Reading a block: the group bans the whole `@/modules` namespace and then negates what the row allows —
// `no-restricted-imports` matches gitignore-style, last match wins.
//
// The globs cover every module source extension, not only the TypeScript ones `src/modules/**` holds
// today: a `.js` file appearing there later must not be a blind spot (code-reviewer, S6 review).
//
// Run: `npm run lint:boundaries` (CI: the `allowed-imports` job).
"use strict";

const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const bb = require("./scripts/boundaries/rules");

// The Sydney tree carried in at bootstrap (HANDOFF §3.2). It is not module code and is excluded until F-d
// crosses it into modules; the list is owned by `eslint.legacy-paths.json` (S1), never duplicated here.
const legacyPaths = require("./eslint.legacy-paths.json");

const LANGUAGE_OPTIONS = {
  parser: tsParser,
  ecmaVersion: 2022,
  sourceType: "module",
};

// `@typescript-eslint` is registered so that `eslint-disable` comments naming its rules resolve here; the
// rules themselves stay off — they are the main `next lint` config's business (`.eslintrc.js`).
const PLUGINS = { bb, "@typescript-eslint": tsPlugin };

const LINTER_OPTIONS = { reportUnusedDisableDirectives: false };

// The 01 §2.3 table as `no-restricted-imports` pattern groups, one per module, in the document's row order.
const GROUPS = {
  "config": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/shared-types",
    "!@/modules/config",
    "!@/modules/config/**",
  ],
  "shared-types": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/shared-types",
    "!@/modules/shared-types/**",
  ],
  "public-site": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/connections",
    "!@/modules/matching",
    "!@/modules/public-site",
    "!@/modules/public-site/**",
  ],
  "areas": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/platform",
    "!@/modules/areas",
    "!@/modules/areas/**",
  ],
  "matching": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/positions",
    "!@/modules/scoring",
    "!@/modules/matching",
    "!@/modules/matching/**",
  ],
  "scoring": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/scoring",
    "!@/modules/scoring/**",
  ],
  "positions": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/connections",
    "!@/modules/placements",
    "!@/modules/positions",
    "!@/modules/positions/**",
  ],
  "call-layer": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/positions",
    "!@/modules/scheduling",
    "!@/modules/call-layer",
    "!@/modules/call-layer/**",
  ],
  "connections": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/placements",
    "!@/modules/connections",
    "!@/modules/connections/**",
  ],
  "placements": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/hire-docs",
    "!@/modules/payments",
    "!@/modules/placements",
    "!@/modules/placements/**",
  ],
  "hire-docs": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/hire-docs",
    "!@/modules/hire-docs/**",
  ],
  "admin-on-behalf": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/app",
    "!@/modules/call-layer",
    "!@/modules/connections",
    "!@/modules/matching",
    "!@/modules/placements",
    "!@/modules/positions",
    "!@/modules/scheduling",
    "!@/modules/admin-on-behalf",
    "!@/modules/admin-on-behalf/**",
  ],
  "scheduling": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/scheduling",
    "!@/modules/scheduling/**",
  ],
  "auth": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/platform",
    "!@/modules/auth",
    "!@/modules/auth/**",
  ],
  "onboarding-parent": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/call-layer",
    "!@/modules/matching",
    "!@/modules/positions",
    "!@/modules/onboarding-parent",
    "!@/modules/onboarding-parent/**",
  ],
  "onboarding-nanny": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/call-layer",
    "!@/modules/verification",
    "!@/modules/onboarding-nanny",
    "!@/modules/onboarding-nanny/**",
  ],
  "verification": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/vetting-providers",
    "!@/modules/verification",
    "!@/modules/verification/**",
  ],
  "vetting-providers": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/vetting-providers",
    "!@/modules/vetting-providers/**",
  ],
  "admin-verification": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/verification",
    "!@/modules/admin-verification",
    "!@/modules/admin-verification/**",
  ],
  "comms": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/platform",
    "!@/modules/comms",
    "!@/modules/comms/**",
  ],
  "platform": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/platform",
    "!@/modules/platform/**",
  ],
  "payments": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/purchase-paths",
    "!@/modules/payments",
    "!@/modules/payments/**",
  ],
  "purchase-paths": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/purchase-paths",
    "!@/modules/purchase-paths/**",
  ],
  "access-gate": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/app",
    "!@/modules/payments",
    "!@/modules/access-gate",
    "!@/modules/access-gate/**",
  ],
  "app": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/app",
    "!@/modules/app/**",
  ],
  "admin": [
    "@/modules/*",
    "@/modules/*/**",
    "!@/modules/config",
    "!@/modules/config/server",
    "!@/modules/shared-types",
    "!@/modules/areas",
    "!@/modules/auth",
    "!@/modules/comms",
    "!@/modules/platform",
    "!@/modules/admin-on-behalf",
    "!@/modules/admin-verification",
    "!@/modules/app",
    "!@/modules/call-layer",
    "!@/modules/connections",
    "!@/modules/payments",
    "!@/modules/placements",
    "!@/modules/positions",
    "!@/modules/scheduling",
    "!@/modules/admin",
    "!@/modules/admin/**",
  ],
};

// The connectors a row allows, read back off its own pattern group so there is one source, not two.
const allowedOf = (group) =>
  group
    .filter((pattern) => pattern.startsWith("!") && !pattern.endsWith("/**"))
    .map((pattern) => pattern.slice(1));

const messageFor = (name, group) =>
  `${name} may import ${allowedOf(group)
    .join(" · ")} — nothing else (01 §2.3, §2.4). A module is entered through its connector: no deep import ` +
  `into another module's inside, and no sub-module connector from outside its parent (05 §7 rules 1–2).`;

module.exports = [
  { ignores: [...legacyPaths] },

  // The rules that enforce everything below get no static analysis otherwise: `tsc` skips them (`allowJs`
  // without `checkJs`) and `next lint` does not scan `scripts/` (typescript-reviewer, S6 review).
  {
    files: ["scripts/boundaries/rules/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { require: "readonly", module: "writable", console: "readonly" },
    },
    linterOptions: LINTER_OPTIONS,
    rules: {
      "no-undef": "error",
      "no-unused-vars": "error",
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: "error",
      "no-empty": "error",
    },
  },

  // L1 (05 §7 rule 4) and the relative half of rule 2 — every module file, one rule set.
  {
    files: ["src/modules/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    languageOptions: LANGUAGE_OPTIONS,
    plugins: PLUGINS,
    linterOptions: LINTER_OPTIONS,
    rules: {
      "bb/one-export-per-file": "error",
      "bb/no-relative-module-escape": "error",
      "bb/no-interpolated-log-message": "error",
    },
  },

  // 01 §2.3 — one block per module, in the document's row order.
  ...Object.entries(GROUPS).map(([name, group]) => ({
    files: [`src/modules/${name}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`],
    languageOptions: LANGUAGE_OPTIONS,
    plugins: PLUGINS,
    linterOptions: LINTER_OPTIONS,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group, message: messageFor(name, group) }] },
      ],
      "bb/no-dynamic-module-import": [
        "error",
        { module: name, allowed: allowedOf(group) },
      ],
    },
  })),
];
