// 03 §9.3 — "`P.id` is a uuid or an opaque id". The claim this unit's merge rests on, and the close of the
// defect `1d` measured on 2026-09-17: **2 944 of 20 000** random v4 uuids (14.7 %) were refused by
// `piiSafeString`, because a hex group whose digit run reaches nine across the hyphens reads as a phone number
// to `scrubFreeText`. Under a unit of work that failed the whole C row, so `chooseSlot` would have failed one
// call in seven against real ids. `1d` pinned it `it.fails` in `call-layer.inside.test.ts`; that pin is flipped
// to a passing test in the same commit as this file.
//
// Two halves, because a fix that only widened the guard would be worse than the defect: every canonical uuid is
// accepted, and every PII shape the guard refused before is still refused. The exemption is whole-value only,
// so `scrubFreeText`'s documented in-place redaction inside prose (pinned in `platform.log.test.ts`) is
// untouched — that test is not bent to this change.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EVENT_SCHEMAS } from "@/modules/platform";
import { piiSafeString } from "../events/lib/pii-safe-string";
import { scrubFreeText } from "../lib/scrub-free-text";

const SAMPLE = 20_000;

/** The exact value `1d` pinned: `1806-4696-48` is a nine-digit run across two hyphens. */
const PINNED_UUID = "750a1806-4696-48bc-a5b0-e23b717d495c";

const accepts = (value: string): boolean =>
  piiSafeString.safeParse(value).success;

describe("piiSafeString — a canonical uuid is an id, never personal data (03 §9.3)", () => {
  it(`accepts all ${SAMPLE} random v4 uuids (1d measured 2 944 refused before this fix)`, () => {
    const refused: string[] = [];
    for (let index = 0; index < SAMPLE; index += 1) {
      const uuid = randomUUID();
      if (!accepts(uuid)) refused.push(uuid);
    }
    expect(refused).toEqual([]);
  });

  it("accepts the exact uuid 1d pinned, and through the C row's own event schema", () => {
    expect(accepts(PINNED_UUID)).toBe(true);
    expect(accepts(PINNED_UUID.toUpperCase())).toBe(true);
    expect(
      EVENT_SCHEMAS["call.slot-chosen"].safeParse({
        bookingId: PINNED_UUID,
        type: "matchmaking",
        slotAt: "2026-01-09T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("the exemption is whole-value only — a uuid inside prose is scrubbed exactly as before", () => {
    const prose = `booking ${PINNED_UUID} failed`;
    expect(scrubFreeText(prose)).not.toBe(prose);
    expect(accepts(prose)).toBe(false);
  });
});

describe("piiSafeString — every shape it refused before is still refused", () => {
  const REFUSED: ReadonlyArray<readonly [string, string]> = [
    ["email", "ann@example.test"],
    ["email mid-value", "write to ann@example.test today"],
    ["phone", "+44 7700 900123"], // config-literal-ok: a PII fixture the guard must refuse
    ["phone, spaced", "07700 900123"], // config-literal-ok: same
    ["phone mid-value", "sms to +44 7700 900123 failed"], // config-literal-ok: same
    ["jwt", "abcdefghijkl.mnopqrstuvwx.yz0123456789_-"],
    ["jwt mid-value", "jwt abcdefghijkl.mnopqrstuvwx.yz0123456789_-"],
    ["sk_ key", "sk_live_ci-dummy"],
    ["sk_ key mid-value", "retry with sk_live_ci-dummy"],
    ["rk_ key", "rk_live_ci-dummy"],
    ["whsec_ key", "whsec_ci-dummy"],
    ["bearer", "Bearer abcdef123456"],
    ["bearer mid-value", "auth Bearer abcdef123456"],
  ];

  it.each(REFUSED)("refuses %s", (_name, value) => {
    expect(accepts(value)).toBe(false);
  });

  it("ordinary labels, paths and districts still pass", () => {
    for (const value of ["cta-primary", "/apply/step-2", "SW4", "pricing"])
      expect(accepts(value)).toBe(true);
  });
});
