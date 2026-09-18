// The level rule (02 §4.3; ADR-157) in TypeScript, pure: barred wins; L4 needs the list + cleared + cross-check +
// the Update Service confirmed; L3 the list + cleared + cross-check; L2 the list; L1 identity submitted; else L0.
// Right-to-work never moves it (ADR-153). An emptied L2–L4 list makes that level unreachable, never free. The
// sections-per-level map is the same rule `vetting-providers` files evidence under — pinned equal here, because
// `required-sections-by-level.ts` restates it so `int.rpc-0023` can import it without the env reader.
// Written RED first — `deriveLevel` and `requiredSectionsByLevel` did not exist.
import { describe, expect, it } from "vitest";
import { VETTING } from "@/modules/config";
import type { EvidenceType } from "@/modules/shared-types";
import { sectionOfEvidenceType } from "@/modules/vetting-providers";
import { deriveLevel, requiredSectionsByLevel } from "../index";
import type { LevelFacts } from "../types";

const facts = (over: Partial<LevelFacts> = {}): LevelFacts => ({
  sections: {
    identity: "not_started",
    dbs: "not_started",
    "right-to-work": "not_started",
  },
  dbsOutcome: "unset",
  crossCheckPassed: false,
  updateServiceConfirmed: false,
  ...over,
});
const verified = (
  identity: LevelFacts["sections"]["identity"],
  dbs: LevelFacts["sections"]["dbs"],
  rtw: LevelFacts["sections"]["right-to-work"] = "not_started",
) => ({ sections: { identity, dbs, "right-to-work": rtw } });

describe("deriveLevel (ADR-157 (1))", () => {
  const derive = (f: LevelFacts) =>
    deriveLevel(f, VETTING.requiredChecksByLevel);

  it("L0 with nothing; L1 once identity is submitted (any status past not_started)", () => {
    expect(derive(facts())).toBe("L0_SIGNED_UP");
    expect(derive(facts(verified("pending", "not_started")))).toBe(
      "L1_REGISTERED",
    );
    expect(derive(facts(verified("rejected", "not_started")))).toBe(
      "L1_REGISTERED",
    );
  });

  it("L2 when the identity list is verified; a verified DBS without the outcome and cross-check stays L2", () => {
    expect(derive(facts(verified("verified", "not_started")))).toBe(
      "L2_ID_VERIFIED",
    );
    expect(derive(facts(verified("verified", "verified")))).toBe(
      "L2_ID_VERIFIED",
    );
    expect(
      derive(
        facts({ ...verified("verified", "verified"), dbsOutcome: "cleared" }),
      ),
    ).toBe("L2_ID_VERIFIED");
  });

  it("L3 = the list + cleared + cross-check passed; L4 adds the Update Service confirmed (B-19 default)", () => {
    const l3 = facts({
      ...verified("verified", "verified"),
      dbsOutcome: "cleared",
      crossCheckPassed: true,
    });
    expect(derive(l3)).toBe("L3_PROVISIONALLY_VERIFIED");
    expect(derive({ ...l3, updateServiceConfirmed: true })).toBe(
      "L4_FULLY_VERIFIED",
    );
  });

  it("barred wins over everything (I-V5)", () => {
    expect(
      derive(
        facts({
          ...verified("verified", "verified"),
          dbsOutcome: "barred",
          crossCheckPassed: true,
          updateServiceConfirmed: true,
        }),
      ),
    ).toBe("L0_SIGNED_UP");
  });

  it("right-to-work never moves the level (ADR-153)", () => {
    expect(
      derive(facts(verified("not_started", "not_started", "verified"))),
    ).toBe("L0_SIGNED_UP");
    const l3 = facts({
      ...verified("verified", "verified", "rejected"),
      dbsOutcome: "cleared",
      crossCheckPassed: true,
    });
    expect(derive(l3)).toBe("L3_PROVISIONALLY_VERIFIED");
  });

  it("an emptied L2–L4 list makes that level unreachable, never free", () => {
    const emptied = {
      ...VETTING.requiredChecksByLevel,
      L4_FULLY_VERIFIED: [] as ReadonlyArray<EvidenceType>,
    };
    const l4 = facts({
      ...verified("verified", "verified"),
      dbsOutcome: "cleared",
      crossCheckPassed: true,
      updateServiceConfirmed: true,
    });
    expect(deriveLevel(l4, emptied)).toBe("L3_PROVISIONALLY_VERIFIED");
  });
});

describe("requiredSectionsByLevel — the config's evidence types as sections", () => {
  it("maps every accepted type the way vetting-providers files it, de-duplicated and sorted", () => {
    const sections = requiredSectionsByLevel(VETTING.requiredChecksByLevel);
    expect(sections.L2_ID_VERIFIED).toEqual(["identity"]);
    expect(sections.L3_PROVISIONALLY_VERIFIED).toEqual(["dbs", "identity"]);
    expect(sections.L4_FULLY_VERIFIED).toEqual(["dbs", "identity"]);
    expect(sections.L0_SIGNED_UP).toEqual([]);
    for (const level of Object.keys(
      VETTING.requiredChecksByLevel,
    ) as ReadonlyArray<keyof typeof VETTING.requiredChecksByLevel>) {
      const expected = [
        ...new Set(
          VETTING.requiredChecksByLevel[level].map(sectionOfEvidenceType),
        ),
      ].sort();
      expect(sections[level]).toEqual(expected);
    }
  });

  it("right-to-work is in no level's list (ADR-153: the gate is one config line)", () => {
    const sections = requiredSectionsByLevel(VETTING.requiredChecksByLevel);
    for (const list of Object.values(sections))
      expect(list).not.toContain("right_to_work");
  });
});
