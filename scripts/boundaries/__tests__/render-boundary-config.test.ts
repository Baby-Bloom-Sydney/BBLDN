// The generator's own output: deterministic, self-describing, and loud about being an output (05 §10).
import { describe, expect, it } from "vitest";
import { MODULE_NAMES } from "@/modules/shared-types/module-names";
import { renderBoundaryConfig } from "../lib/render-boundary-config";
import { checkResult } from "../lib/check-result";

describe("renderBoundaryConfig", () => {
  const text = renderBoundaryConfig();

  it("is deterministic", () => {
    expect(renderBoundaryConfig()).toBe(text);
  });

  it("says it is generated and names the generator and the source", () => {
    expect(text).toContain("scripts/gen-boundary-rules.ts");
    expect(text).toContain("01-architecture.md");
    expect(text).toMatch(/do not edit/iu);
  });

  it("ends with exactly one newline", () => {
    expect(text.endsWith("}\n") || text.endsWith("];\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("carries one pattern group per module named in 00 §3, exactly once", () => {
    for (const name of MODULE_NAMES) {
      expect(
        text.split(`  "${name}": [`),
        `${name} needs one group`,
      ).toHaveLength(2);
    }
  });

  it("reads the legacy tree at run time rather than inlining it", () => {
    expect(text).toContain("eslint.legacy-paths.json");
  });
});

describe("checkResult", () => {
  it("passes when the committed file is what the generator writes", () => {
    expect(checkResult("same", "same").ok).toBe(true);
  });

  it("fails and says how to fix it when the committed file drifted", () => {
    const result = checkResult("stale", "fresh");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/gen:boundary-rules/u);
  });
});
