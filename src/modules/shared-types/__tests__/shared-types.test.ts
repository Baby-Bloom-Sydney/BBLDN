// shared-types — the register is the contract (02 §3 enums with ordinals; 03 §2.5 / §3.2 / §9.3 unions).
// Tests read the tuples, never restate a foundation value they do not need to pin.
import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  CLIENT_EVENT_NAMES,
  ERROR_CODES,
  EVENT_NAMES,
  MODULE_NAMES,
  SYSTEM_JOB_NAMES,
  TRANSITION_IDS,
} from "@/modules/shared-types";
import { ENUMS } from "@/modules/shared-types/enums";

const ENUM_COUNT = 80; // 02 §3 "Count: 79 enums" + `consent_purpose` (0017, ADR-131 (2))
const EVENT_NAME_COUNT = 88; // 03 §9.3
const TRANSITION_COUNT = 44; // 03 §2.4 "44 rows"
const MODULE_COUNT = 26; // 00 §3 / HANDOFF §4.1
const ERROR_CODE_COUNT = 8; // 01 §4a

function hasDuplicates(values: ReadonlyArray<string>): boolean {
  return new Set(values).size !== values.length;
}

describe("shared-types enum register (02 §3)", () => {
  it("carries every enum of 02 §3 as a frozen tuple whose index is the ordinal", () => {
    const names = Object.keys(ENUMS);
    expect(names).toHaveLength(ENUM_COUNT);
    for (const name of names) {
      const values = ENUMS[name as keyof typeof ENUMS];
      expect(Object.isFrozen(values), `${name} frozen`).toBe(true);
      expect(values.length, `${name} non-empty`).toBeGreaterThan(0);
      expect(hasDuplicates(values), `${name} unique`).toBe(false);
    }
  });

  it("orders verification_level 0–4 and position_stage along the spine (ordinal = index)", () => {
    expect(ENUMS.verification_level.indexOf("L0_SIGNED_UP")).toBe(0);
    expect(ENUMS.verification_level.indexOf("L4_FULLY_VERIFIED")).toBe(4);
    expect(ENUMS.position_stage.indexOf("OPEN")).toBeLessThan(
      ENUMS.position_stage.indexOf("ACTIVE"),
    );
    expect(ENUMS.connection_stage.indexOf("INTRO_SCHEDULED")).toBeLessThan(
      ENUMS.connection_stage.indexOf("INTRO_COMPLETE"),
    );
  });

  it("pins every enum's exact order — a reorder or an insertion moves ordinals and must be a deliberate snapshot update (02 C-1)", () => {
    expect(ENUMS).toMatchSnapshot();
  });

  it("keeps the reserved values the register names (ADR-099, R-12)", () => {
    expect(ENUMS.guarantee_promise).toContain("nanny-bonus");
    expect(ENUMS.user_role).not.toContain("super_admin");
    expect(ENUMS.call_state).toEqual(["awaiting-slot", "slot-chosen", "done"]);
  });
});

describe("shared-types registries (01 §4a, 03 §2.5, §3.2, §9.3, 00 §3)", () => {
  it("lists the eight ErrorCodes", () => {
    expect(ERROR_CODES).toHaveLength(ERROR_CODE_COUNT);
    expect(hasDuplicates(ERROR_CODES)).toBe(false);
  });

  it("lists the 88 EventNames, add-only, with the client subset inside it", () => {
    expect(EVENT_NAMES).toHaveLength(EVENT_NAME_COUNT);
    expect(hasDuplicates(EVENT_NAMES)).toBe(false);
    for (const name of CLIENT_EVENT_NAMES) expect(EVENT_NAMES).toContain(name);
  });

  it("lists the 44 TransitionIds of the 03 §2.4 table", () => {
    expect(TRANSITION_IDS).toHaveLength(TRANSITION_COUNT);
    expect(hasDuplicates(TRANSITION_IDS)).toBe(false);
    expect(TRANSITION_IDS).not.toContain("C-e"); // deprecated to §2.7
  });

  it("names every system job once (03 §2.5 one-list rule)", () => {
    expect(hasDuplicates(SYSTEM_JOB_NAMES)).toBe(false);
    expect(SYSTEM_JOB_NAMES).toContain("usage-weekly-check");
    expect(SYSTEM_JOB_NAMES).toContain("payment-due-sweep");
  });

  it("lists the 26 modules and the three slot-occupying booking statuses", () => {
    expect(MODULE_NAMES).toHaveLength(MODULE_COUNT);
    expect(ACTIVE_STATUSES).toEqual(["held", "booked", "rescheduled"]);
    for (const status of ACTIVE_STATUSES)
      expect(ENUMS.booking_status).toContain(status);
  });
});
