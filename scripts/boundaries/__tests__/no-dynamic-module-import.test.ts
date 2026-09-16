// ESLint 8's `no-restricted-imports` reads static declarations only, so `await import("@/modules/x")` and
// `typeof import("@/modules/x")` pass it silently. This rule applies the same row to both.
import { createRequire } from "node:module";
import { RuleTester } from "eslint";
import rule from "../rules/no-dynamic-module-import.js";
import { allowedSpecifiers } from "../lib/allowed-specifiers";

const require_ = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require_.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const options = [
  {
    module: "matching",
    allowed: allowedSpecifiers("matching").filter(
      (specifier) => !specifier.endsWith("/**"),
    ),
  },
];

const inMatching = "/repo/src/modules/matching/actions/create-match.ts";

ruleTester.run("bb/no-dynamic-module-import", rule, {
  valid: [
    {
      code: 'await import("@/modules/positions");',
      filename: inMatching,
      options,
    },
    {
      code: 'await import("@/modules/config/server");',
      filename: inMatching,
      options,
    },
    {
      code: 'await import("@/modules/matching/lib/score");',
      filename: inMatching,
      options,
    },
    { code: 'await import("../lib/score");', filename: inMatching, options },
    { code: 'await import("zod");', filename: inMatching, options },
    {
      code: 'type A = typeof import("@/modules/shared-types");',
      filename: inMatching,
      options,
    },
    // Outside `src/modules` there is no module to hold anything inside.
    {
      code: 'await import("@/modules/connections");',
      filename: "/repo/src/app/api/thing/route.ts",
      options,
    },
  ],
  invalid: [
    {
      code: 'await import("@/modules/connections");',
      filename: inMatching,
      options,
      errors: [{ messageId: "restricted" }],
    },
    {
      code: 'await import("@/modules/positions/lib/pick");',
      filename: inMatching,
      options,
      errors: [{ messageId: "restricted" }],
    },
    {
      code: 'type A = import("@/modules/connections").Foo;',
      filename: inMatching,
      options,
      errors: [{ messageId: "restricted" }],
    },
    {
      code: 'await import("../../positions/lib/pick");',
      filename: inMatching,
      options,
      errors: [{ messageId: "escape" }],
    },
    {
      code: "await import(`@/modules/${name}`);",
      filename: inMatching,
      options,
      errors: [{ messageId: "computed" }],
    },
  ],
});
