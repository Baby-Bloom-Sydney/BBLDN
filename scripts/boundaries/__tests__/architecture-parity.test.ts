// `check:allowed-imports` says in the job log whether §2.3 parity was checked or skipped, so the gap the
// `describe.skipIf` leaves in CI is visible rather than buried in a skip count (silent-failure-hunter, S6).
import { describe, expect, it } from "vitest";
import { architectureParity } from "../lib/architecture-parity";

const TABLE = `### 2.3 Allowed-imports table

| Module | May import | Notes |
|---|---|---|
| \`matching\` | \`positions\` · \`scoring\` · \`areas\` (S) · \`platform\` (S) | — |

### 2.4 Service modules
`;

describe("architectureParity", () => {
  it("passes with a loud NOTICE when the document is not in the checkout (CI — ADR-107)", () => {
    const result = architectureParity(null);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("NOTICE");
    expect(result.message).toMatch(/LOCAL gate/u);
  });

  it("fails and names every row that drifted", () => {
    const result = architectureParity(TABLE);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("config");
    expect(result.message).toContain("<missing>");
  });

  it("names the drifting row's two sides when a row exists on both", () => {
    const changed = TABLE.replace("`scoring` · ", "");
    const result = architectureParity(changed);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/matching: copy = \[.*scoring.*\]/u);
  });
});
