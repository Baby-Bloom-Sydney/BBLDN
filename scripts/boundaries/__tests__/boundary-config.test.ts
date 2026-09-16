// The committed `eslint.boundaries.js` is an output, never hand-edited (05 §10). These suites read the real
// artefact and prove (a) it is what the generator would write today, (b) it carries one block per module, and
// (c) the generated patterns mean what 01 §2.3 says when ESLint itself evaluates them.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import { MODULE_NAMES } from "@/modules/shared-types/module-names";
import { renderBoundaryConfig } from "../lib/render-boundary-config";
import { restrictedImportGroup } from "../lib/restricted-import-group";

const require_ = createRequire(import.meta.url);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const GENERATED = resolve(REPO_ROOT, "eslint.boundaries.js");

describe("eslint.boundaries.js", () => {
  it("is byte-identical to a fresh generation (05 §10 regenerated-not-edited)", () => {
    expect(readFileSync(GENERATED, "utf8")).toBe(renderBoundaryConfig());
  });

  it("passes its own `--check` (the CI step `npm run check:allowed-imports` runs)", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["scripts/gen-boundary-rules.ts", "--check"],
        {
          cwd: REPO_ROOT,
          stdio: "pipe",
        },
      ),
    ).not.toThrow();
  });

  it("carries one boundary block per module named in 00 §3", () => {
    const config = require_(GENERATED) as ReadonlyArray<{
      readonly files?: readonly string[];
    }>;
    const blocks = config.flatMap((block) => block.files ?? []);
    for (const name of MODULE_NAMES) {
      expect(blocks, `no block for ${name}`).toContain(
        `src/modules/${name}/**/*.{ts,tsx,mts,cts}`,
      );
    }
  });

  it("excludes the legacy tree from `eslint.legacy-paths.json` (S1; until F-d)", () => {
    const config = require_(GENERATED) as ReadonlyArray<{
      readonly ignores?: readonly string[];
    }>;
    const legacy = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "eslint.legacy-paths.json"), "utf8"),
    ) as readonly string[];
    const ignores = config.flatMap((block) => block.ignores ?? []);
    for (const glob of legacy) expect(ignores).toContain(glob);
  });
});

describe("the generated patterns, evaluated by ESLint", () => {
  const linter = new Linter({ configType: "flat" });
  const lint = (code: string): ReadonlyArray<string> =>
    linter
      .verify(code, [
        {
          languageOptions: {
            parser: require_(
              "@typescript-eslint/parser",
            ) as Linter.ParserModule,
            ecmaVersion: 2022,
            sourceType: "module",
          },
          rules: {
            "no-restricted-imports": [
              "error",
              { patterns: [{ group: [...restrictedImportGroup("matching")] }] },
            ],
          },
        },
      ])
      .map((message) => message.message);

  it("allows the row of 01 §2.3, the services and the two universals", () => {
    expect(
      lint(
        [
          'import "@/modules/positions";',
          'import "@/modules/scoring";',
          'import "@/modules/areas";',
          'import "@/modules/auth";',
          'import "@/modules/comms";',
          'import "@/modules/platform";',
          'import "@/modules/config";',
          'import "@/modules/config/server";',
          'import "@/modules/shared-types";',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("allows the module's own inside at any depth", () => {
    expect(lint('import "@/modules/matching/lib/score.js";')).toEqual([]);
  });

  it("forbids a module the row does not name", () => {
    expect(lint('import "@/modules/connections";')).toHaveLength(1);
  });

  it("forbids a deep import into a module the row does name", () => {
    expect(lint('import "@/modules/positions/lib/pick";')).toHaveLength(1);
  });

  it("forbids a sub-module connector of another module (05 §7 rule 2)", () => {
    expect(lint('import "@/modules/platform/log";')).toHaveLength(1);
  });

  it("forbids a deep import into `config` other than its second entry point", () => {
    expect(lint('import "@/modules/config/lib/env-schema";')).toHaveLength(1);
  });

  it("catches a re-export as well as an import", () => {
    expect(lint('export { a } from "@/modules/connections";')).toHaveLength(1);
  });
});
