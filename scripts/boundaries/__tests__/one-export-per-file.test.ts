// L1 — "a file exports exactly one thing" (05 §7 rule 4). Type-only exports are the "one type group" L1 names,
// so they never count against the single value export; the exemptions are listed in the rule, never in files.
import { createRequire } from "node:module";
import { RuleTester } from "eslint";
import rule from "../rules/one-export-per-file.js";

const require_ = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require_.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const helper = "/repo/src/modules/matching/lib/score-position.ts";

ruleTester.run("bb/one-export-per-file", rule, {
  valid: [
    { code: "export const a = 1;", filename: helper },
    { code: "export function a() {}", filename: helper },
    { code: "export default function a() {}", filename: helper },
    { code: "export const { a } = actions;", filename: helper },
    // A value plus the types that describe it is one thing, not two (L1's "one type group").
    {
      code: "export type A = { a: 1 };\nexport interface B { b: 2 }\nexport const a: A = { a: 1 };",
      filename: helper,
    },
    // No value export at all: the file is a type group.
    {
      code: "export type A = 1;\nexport type B = 2;\nexport type C = 3;",
      filename: helper,
    },
    // Exemptions, listed here and not in the files themselves.
    {
      code: "export { a } from './a';\nexport { b } from './b';",
      filename: "/repo/src/modules/matching/index.ts",
    },
    {
      code: "export type A = 1;\nexport const B = 2;\nexport const C = 3;",
      filename: "/repo/src/modules/matching/types.ts",
    },
    {
      code: "export const a = 1;\nexport const b = 2;",
      filename: "/repo/src/modules/matching/__tests__/fixtures/env.ts",
    },
    {
      code: "export const a = 1;\nexport const b = 2;",
      filename: "/repo/src/modules/matching/__tests__/matching.test.ts",
    },
    // Next route files: default plus the framework's own named exports.
    {
      code: "export const metadata = {};\nexport default function Page() {}",
      filename: "/repo/src/app/(public)/page.tsx",
    },
    {
      code: "export async function GET() {}\nexport async function POST() {}",
      filename: "/repo/src/app/api/thing/route.ts",
    },
  ],
  invalid: [
    {
      code: "export const a = 1;\nexport const b = 2;",
      filename: helper,
      errors: [{ messageId: "tooMany" }],
    },
    {
      code: "const a = 1;\nconst b = 2;\nexport { a, b };",
      filename: helper,
      errors: [{ messageId: "tooMany" }],
    },
    {
      code: "export const a = 1, b = 2;",
      filename: helper,
      errors: [{ messageId: "tooMany" }],
    },
    // A destructured export publishes one name per binding, not one per declarator.
    {
      code: "export const { a, b } = actions;",
      filename: helper,
      errors: [{ messageId: "tooMany" }],
    },
    {
      code: "export const [a, b] = pair;",
      filename: helper,
      errors: [{ messageId: "tooMany" }],
    },
    {
      code: "export const { a, ...rest } = actions;",
      filename: helper,
      errors: [{ messageId: "tooMany" }],
    },
    {
      code: "export function a() {}\nexport default function b() {}",
      filename: helper,
      errors: [{ messageId: "tooMany" }],
    },
    // A stub honours its connector with exactly one export like any other file.
    {
      code: "export const a = 1;\nexport const b = 2;",
      filename: "/repo/src/modules/matching/matching.stub.ts",
      errors: [{ messageId: "tooMany" }],
    },
    // A route file may not export business helpers beside its framework exports.
    {
      code: "export default function Page() {}\nexport const helper = 1;",
      filename: "/repo/src/app/(public)/page.tsx",
      errors: [{ messageId: "routeExport" }],
    },
    {
      code: "const a = 1;",
      filename: helper,
      errors: [{ messageId: "none" }],
    },
  ],
});
