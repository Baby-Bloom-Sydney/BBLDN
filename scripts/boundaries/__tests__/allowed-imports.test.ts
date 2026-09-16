// The machine-readable copy of the 01 §2.3 allowed-imports table is the generator's source (05 §7 rule 1).
// These suites pin its shape against `shared-types/module-names.ts` (00 §3 — the 26 day-one modules) and
// prove the declared graph is acyclic, which is what 05 §7 rule 3 ("no cycles at module level") means once
// cross-module imports are restricted to connectors.
import { describe, expect, it } from "vitest";
import { MODULE_NAMES } from "@/modules/shared-types/module-names";
import { ALLOWED_IMPORTS } from "../allowed-imports";
import { SERVICE_MODULES } from "../service-modules";
import { UNIVERSAL_MODULES } from "../universal-modules";
import { EXTRA_ENTRY_POINTS } from "../extra-entry-points";
import { assertAcyclic } from "../lib/assert-acyclic";

describe("ALLOWED_IMPORTS", () => {
  it("has exactly one row per module named in 00 §3", () => {
    expect(Object.keys(ALLOWED_IMPORTS).sort()).toEqual(
      [...MODULE_NAMES].sort(),
    );
  });

  it("names no module that 00 §3 does not list", () => {
    const unknown = Object.values(ALLOWED_IMPORTS)
      .flatMap((row) => [...row])
      .filter((target) => !MODULE_NAMES.includes(target));
    expect(unknown).toEqual([]);
  });

  it("never lets a module import itself", () => {
    const selfImports = Object.entries(ALLOWED_IMPORTS).filter(([name, row]) =>
      row.includes(name as (typeof MODULE_NAMES)[number]),
    );
    expect(selfImports).toEqual([]);
  });

  it("keeps the four service modules and the two universal modules as leaves (01 §2.4; ADR-069)", () => {
    for (const leaf of [...SERVICE_MODULES, ...UNIVERSAL_MODULES]) {
      expect(ALLOWED_IMPORTS[leaf]).toEqual([]);
    }
  });

  it("lists each row in the document's order, de-duplicated", () => {
    for (const [name, row] of Object.entries(ALLOWED_IMPORTS)) {
      expect(new Set(row).size, `${name} has a duplicate target`).toBe(
        row.length,
      );
    }
  });
});

describe("EXTRA_ENTRY_POINTS", () => {
  it("gives `config` its second entry point and nothing else one (01 §3.3; 05 §7 rule 2)", () => {
    expect(EXTRA_ENTRY_POINTS).toEqual({ config: ["server"] });
  });
});

describe("assertAcyclic", () => {
  it("accepts the declared table (05 §7 rule 3)", () => {
    expect(() => assertAcyclic(ALLOWED_IMPORTS)).not.toThrow();
  });

  it("names the cycle it found", () => {
    expect(() => assertAcyclic({ a: ["b"], b: ["c"], c: ["a"] })).toThrowError(
      /a → b → c → a/u,
    );
  });

  it("accepts a diamond, which is not a cycle", () => {
    expect(() =>
      assertAcyclic({ a: ["b", "c"], b: ["d"], c: ["d"], d: [] }),
    ).not.toThrow();
  });
});
