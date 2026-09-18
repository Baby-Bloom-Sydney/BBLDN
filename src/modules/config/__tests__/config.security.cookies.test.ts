// The two cookies the consent surfaces depend on, and the one property that must never be true of both
// (L-009 `3g`; ADR-175 (c)).
//
// They are a pair with opposite jobs: `visitorCookie` is HttpOnly and signed because it decides *which row a
// write lands on*, and `consentPreferenceCookie` is readable because the gate in the browser has to consult it
// on every page without a round trip. Confusing the two in either direction is a real defect — a readable
// visitor id is the Sydney bug `3e` fixed, and an HttpOnly preference cookie would silently disable the gate
// and mount nothing ever — so the names are asserted to differ and the lives asserted to match the record's.
import { describe, expect, it } from "vitest";
import { SECURITY } from "@/modules/config";

describe("config/security — the consent cookie pair", () => {
  it("they are two different cookies", () => {
    expect(SECURITY.consentPreferenceCookie.name).not.toBe(
      SECURITY.visitorCookie.name,
    );
  });

  it("both live exactly as long as the record they mirror (07 §6.2 row 12)", () => {
    const expected = SECURITY.retention.cookieExpiryDays * 24 * 60 * 60;
    expect(SECURITY.visitorCookie.maxAgeSeconds).toBe(expected);
    expect(SECURITY.consentPreferenceCookie.maxAgeSeconds).toBe(expected);
  });

  it("neither name leaks the brand or the jurisdiction (ADR-171)", () => {
    for (const name of [
      SECURITY.consentPreferenceCookie.name,
      SECURITY.visitorCookie.name,
    ]) {
      expect(name).toMatch(/^bb_[a-z_]+$/);
    }
  });
});
