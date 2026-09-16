// Reads the §2.3 allowed-imports table out of `01-architecture.md` so the machine-readable copy in
// `allowed-imports.ts` can be proved equal to it (the parity suite). Deliberately narrow: only markdown table
// rows between the `### 2.3` heading and the next `###` heading are read, only the first two cells of each,
// and only backticked tokens — the notes column and the prose around the table name modules too.
//
// The two universal modules are dropped from every row: 01 §2.2 allows them to **every** module, so where a
// row spells them out (`scheduling`'s "(+ `config` · `shared-types`)") it is restating the universal rule, not
// adding an arrow. `lib/allowed-specifiers.ts` applies that rule for every row alike.
import { UNIVERSAL_MODULES } from "../universal-modules.ts";

const HEADING = /^###\s+2\.3\b/u;
const NEXT_HEADING = /^#{1,3}\s/u;
const BACKTICKED = /`([a-z][a-z0-9-]*)`/gu;

const cellsOf = (line: string): readonly string[] =>
  line
    .replace(/^\s*\|/u, "")
    .replace(/\|\s*$/u, "")
    .split("|");

const namesIn = (cell: string): readonly string[] =>
  [...cell.matchAll(BACKTICKED)].map((match) => match[1]);

const isUniversal = (name: string): boolean =>
  (UNIVERSAL_MODULES as readonly string[]).includes(name);

export function parseArchitectureTable(
  markdown: string,
): Record<string, string[]> {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => HEADING.test(line));
  if (start === -1)
    throw new Error("01-architecture.md has no §2.3 allowed-imports table");

  const table: Record<string, string[]> = {};
  for (const line of lines.slice(start + 1)) {
    if (NEXT_HEADING.test(line)) break;
    if (!line.trimStart().startsWith("|")) continue;
    const cells = cellsOf(line);
    if (cells.length < 2) continue;
    const [name] = namesIn(cells[0] ?? "");
    if (name === undefined) continue;
    table[name] = namesIn(cells[1] ?? "").filter(
      (target) => !isUniversal(target),
    );
  }

  if (Object.keys(table).length === 0)
    throw new Error("01-architecture.md §2.3 has no table rows");
  return table;
}
