// `allowed-imports.ts` is a copy of `01-architecture.md` §2.3, so something has to prove the two still agree.
// The vitest suite does it, but it is `skipIf`-ed wherever the sibling `LDN/` tree is absent — which is every
// CI run (ADR-107 "linked"), and a skipped test among many passing ones is not a visible gap
// (silent-failure-hunter, S6 review). So `check:allowed-imports` says it out loud in the job log instead:
// parity checked, or parity skipped and why. `scripts/ci/check-claude-md.sh` is the precedent.
import { ALLOWED_IMPORTS } from "../allowed-imports.ts";
import { parseArchitectureTable } from "./parse-architecture-table.ts";

export function architectureParity(markdown: string | null): {
  readonly ok: boolean;
  readonly message: string;
} {
  if (markdown === null)
    return {
      ok: true,
      message:
        "check:allowed-imports: NOTICE — 01-architecture.md is not in this checkout (ADR-107 linked shape), so §2.3 parity is a LOCAL gate only. Here it is proved by scripts/boundaries/__tests__/parse-architecture-table.test.ts; run `npm test` beside the LDN tree before changing the table.",
    };

  const fromDocument = parseArchitectureTable(markdown);
  const rowsOf = (
    entries: ReadonlyArray<readonly [string, readonly string[]]>,
  ): ReadonlyMap<string, string> =>
    new Map(entries.map(([name, row]) => [name, row.join(" · ")]));

  const copy = rowsOf(Object.entries(ALLOWED_IMPORTS));
  const document = rowsOf(Object.entries(fromDocument));
  const drift = [...new Set([...copy.keys(), ...document.keys()])]
    .map((module) => ({
      module,
      copy: copy.get(module) ?? "<missing>",
      document: document.get(module) ?? "<missing>",
    }))
    .filter((row) => row.copy !== row.document);

  if (drift.length === 0)
    return {
      ok: true,
      message: `check:allowed-imports: OK — allowed-imports.ts matches 01-architecture.md §2.3 (${copy.size} rows)`,
    };

  return {
    ok: false,
    message: [
      "check:allowed-imports: FAIL — allowed-imports.ts and 01-architecture.md §2.3 disagree. The document is the",
      "authority: change it first (a new module or arrow needs an ADR), then the copy, then regenerate.",
      ...drift.map(
        (row) =>
          `  ${row.module}: copy = [${row.copy}] · document = [${row.document}]`,
      ),
    ].join("\n"),
  };
}
