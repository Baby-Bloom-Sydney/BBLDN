// The prefill S-P-04's edit state depends on (04 §6.2). The claim is a **round trip**, not a field list: what a
// parent answered, turned into a position and read back into answers, must produce the same position again —
// otherwise opening the edit screen and pressing straight through would quietly change what she asked for, which
// is the same class of defect as an amend that changes nothing.
import { describe, expect, it } from "vitest";
import { positionDetailOf, wizardAnswersOf } from "@/modules/matching";
import type { WizardAnswers } from "@/modules/matching";

const ANSWERS = Object.freeze({
  children: [{ ageLabel: "1–2 years" }, { ageLabel: "3–4 years" }],
  area: { area: "Hackney", district: "E8" },
  days: [1, 3, 5],
  parts: ["morning", "afternoon"],
  scheduleType: "Fixed",
  minExperienceYears: 3,
  drivingLicence: true,
  car: false,
  nonSmoker: true,
  petsAtHome: false,
  languages: ["French", "Spanish"],
} as const) satisfies WizardAnswers;

describe("the wizard answers round-trip through the position detail", () => {
  it("rebuilds the same detail from the answers it read back", () => {
    const first = positionDetailOf(ANSWERS);
    expect(first).not.toBeNull();
    const again = positionDetailOf(wizardAnswersOf(first!));
    expect(again).toEqual(first);
  });

  it("recovers every answer the detail actually carries", () => {
    const detail = positionDetailOf(ANSWERS);
    const back = wizardAnswersOf(detail!);
    expect(back.area).toEqual(ANSWERS.area);
    expect(back.children).toEqual(ANSWERS.children);
    expect([...(back.days ?? [])].sort()).toEqual([1, 3, 5]);
    expect([...(back.parts ?? [])].sort()).toEqual(["afternoon", "morning"]);
    expect(back.scheduleType).toBe("Fixed");
    expect(back.minExperienceYears).toBe(3);
    expect(back.drivingLicence).toBe(true);
    expect(back.car).toBe(false);
    expect(back.nonSmoker).toBe(true);
    expect(back.petsAtHome).toBe(false);
    expect(back.languages).toEqual(["French", "Spanish"]);
  });

  /**
   * Recorded, not faked. These five answers have no field on `PositionMatchDetail` and no column behind it, so
   * they are lost at **create**, not at edit — the edit screen asks them again rather than showing a remembered
   * answer that was never kept. This test is the record; a later unit that gives them a home deletes it.
   */
  it("does not pretend to remember the five answers the position never stored", () => {
    const back = wizardAnswersOf(positionDetailOf(ANSWERS)!);
    for (const key of [
      "hoursPerWeek",
      "placementLength",
      "startWhen",
      "focus",
      "support",
    ] as const)
      expect(back[key]).toBeUndefined();
  });

  it("drops a child age band no label owns rather than inventing one", () => {
    const back = wizardAnswersOf({
      area: { area: "Hackney", district: "E8" },
      schedule: null,
      requirements: {
        childAgeMonths: [{ min: 100, max: 111 }],
        capacity: 1,
        specialNeeds: false,
        licence: false,
        car: false,
        vaccination: false,
        nonSmoker: false,
        pets: false,
        roleType: "",
      },
    });
    expect(back.children).toBeUndefined();
  });
});
