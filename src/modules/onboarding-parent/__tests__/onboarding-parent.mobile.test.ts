// ADR-102 / C-7: the mobile a parent types becomes the one stored E.164 form, and nothing that is not a UK mobile
// passes. The stored form is checked against the CHECK constraint's own pattern (0002_identity.sql), built from
// the config prefix (L4 — no locale literal here either).
import { describe, expect, it } from "vitest";
import { LOCALE } from "@/modules/config";
import { normaliseUkMobile } from "../lib/normalise-uk-mobile";

const PREFIX = LOCALE.phonePrefix;
const CODE = PREFIX.slice(1);
const STORED = `${PREFIX}7700900123`;
const C7 = new RegExp(`^\\${PREFIX}[1-9][0-9]{8,9}$`);

describe("onboarding-parent — normaliseUkMobile (ADR-102)", () => {
  it.each([
    ["07700 900123", STORED],
    ["07700900123", STORED],
    [`${PREFIX} 7700 900123`, STORED],
    [`${PREFIX}7700900123`, STORED],
    [`${CODE}7700900123`, STORED],
    [`00${CODE} 7700 900123`, STORED],
    ["(07700) 900-123", STORED],
  ])("accepts %s as %s and it satisfies C-7", (raw, stored) => {
    expect(normaliseUkMobile(raw)).toBe(stored);
    expect(stored).toMatch(C7);
  });

  it.each([
    ["020 7946 0000", "a London landline"],
    ["0412 345 678", "an Australian mobile"],
    ["+61 412 345 678", "an Australian mobile in E.164"],
    ["0770 090012", "too short"],
    ["07700 9001234", "too long"],
    ["seven seven", "not a number"],
    ["", "empty"],
  ])("rejects %s (%s)", (raw) => {
    expect(normaliseUkMobile(raw)).toBeNull();
  });
});
