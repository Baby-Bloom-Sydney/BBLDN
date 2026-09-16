// `no-restricted-imports` only sees the specifier it is given, so `../../positions/lib/pick` walks straight
// past the generated patterns. This rule closes that: a relative specifier may not leave its own module
// (01 §2.3 "deep imports are a review failure"; 05 §7 rule 2).
import { createRequire } from "node:module";
import { RuleTester } from "eslint";
import rule from "../rules/no-relative-module-escape.js";

const require_ = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require_.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const inMatching = "/repo/src/modules/matching/actions/create-match.ts";

ruleTester.run("bb/no-relative-module-escape", rule, {
  valid: [
    { code: "import { a } from '../lib/a';", filename: inMatching },
    { code: "import { a } from './a';", filename: inMatching },
    { code: "import { a } from '../../matching/lib/a';", filename: inMatching },
    { code: "import { a } from '@/modules/positions';", filename: inMatching },
    { code: "import { a } from 'zod';", filename: inMatching },
    // Outside `src/modules` the rule has no module to hold anything inside.
    {
      code: "import { a } from '../../../scripts/ci/lib/a';",
      filename: "/repo/src/app/api/thing/route.ts",
    },
    // Test files reach the repo's own tooling on purpose (`config.repo.test.ts` reads the generators).
    {
      code: "import { a } from '../../../../scripts/env/lib/render-env-example';",
      filename: "/repo/src/modules/config/__tests__/config.repo.test.ts",
    },
  ],
  invalid: [
    {
      code: "import { a } from '../../positions/lib/pick';",
      filename: inMatching,
      errors: [{ messageId: "escape" }],
    },
    {
      code: "export { a } from '../../positions';",
      filename: inMatching,
      errors: [{ messageId: "escape" }],
    },
    {
      code: "export * from '../../../lib/legacy-helper';",
      filename: inMatching,
      errors: [{ messageId: "escape" }],
    },
  ],
});
