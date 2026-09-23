"use strict";

// The flat config `check-gate-fixtures.mjs` lints the two fixture files with. It exists as a file rather
// than an inline object for one reason: ESLint 8's Node API takes eslintrc-shaped config, and the gate
// itself is flat — so driving the fixtures through the same CLI path `lint:boundaries` already uses is the
// only way to be sure the fixtures are linted the way the gate lints.
//
// The rules are **required, never restated**: `scripts/boundaries/rules/typed-rule-set.js` is the one copy,
// shared with `eslint.typed.js`. A fixture suite that lints with a hand-copied rule set proves something
// about the copy.

const { resolve } = require("node:path");

const REPO_ROOT = resolve(__dirname, "../../..");

module.exports = [
  {
    files: ["scripts/ci/gate-fixtures/*.fixture.ts"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: REPO_ROOT,
      },
    },
    plugins: {
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
      bb: require(resolve(REPO_ROOT, "scripts/boundaries/rules")),
    },
    rules: require(
      resolve(REPO_ROOT, "scripts/boundaries/rules/typed-rule-set"),
    ),
  },
];
