// `01-architecture.md` §2.3 is the authority; `allowed-imports.ts` is the machine-readable copy the generator
// reads (the foundations are not in the CI checkout — ADR-107 keeps them in the sibling `LDN/` tree). This is
// the only place the table is written twice, so the parity suite below is what keeps the copy honest.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALLOWED_IMPORTS } from "../allowed-imports";
import { parseArchitectureTable } from "../lib/parse-architecture-table";

const FIXTURE = `
### 2.2 Reading the map

Prose that must be ignored, naming \`positions\` and \`admin\`.

### 2.3 Allowed-imports table

| Module | May import (connectors only) | Notes |
|---|---|---|
| \`config\` | — | leaf; §3 |
| \`matching\` | \`positions\` · \`scoring\` · \`areas\` (S) · \`platform\` (S) | calls \`positions\`' connector |
| \`scoring\` | \`areas\` (S) | \`scoring/distance\` **swappable** |

(S) = service module, §2.4.

### 2.4 Service modules
`;

describe("parseArchitectureTable", () => {
  const parsed = parseArchitectureTable(FIXTURE);

  it("reads one row per table line and nothing from the prose around it", () => {
    expect(Object.keys(parsed)).toEqual(["config", "matching", "scoring"]);
  });

  it("reads an em-dash cell as an empty row", () => {
    expect(parsed.config).toEqual([]);
  });

  it("reads only the `May import` cell, ignoring the notes column", () => {
    expect(parsed.matching).toEqual([
      "positions",
      "scoring",
      "areas",
      "platform",
    ]);
    expect(parsed.scoring).toEqual(["areas"]);
  });

  it("refuses a document with no §2.3 table rather than returning an empty table", () => {
    expect(() => parseArchitectureTable("# nothing here")).toThrowError(
      /§2\.3/u,
    );
  });
});

const ARCHITECTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../SPECS/00-foundations/01-architecture.md",
);

// Skipped where the foundations are not checked out beside the repo (CI — ADR-107 "linked" shape), exactly as
// `scripts/ci/check-claude-md.sh` skips its byte diff there. Locally it is the parity gate.
describe.skipIf(!existsSync(ARCHITECTURE))(
  "allowed-imports.ts matches 01-architecture.md §2.3",
  () => {
    it("has the same rows with the same targets in the same order", () => {
      const fromDoc = parseArchitectureTable(
        readFileSync(ARCHITECTURE, "utf8"),
      );
      expect(ALLOWED_IMPORTS).toEqual(fromDoc);
    });
  },
);
