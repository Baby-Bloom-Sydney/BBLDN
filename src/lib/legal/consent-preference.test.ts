// The readable consent-preference cookie's value, judged as a format rather than as a behaviour (L-009 `3g`).
//
// It is worth its own suite for one reason: this string is the **only** thing standing between a visitor who has
// not answered and a tracker being mounted (ADR-175 (c)). Every ambiguous input therefore has to resolve to "no
// answer" — not to a partially-parsed object, and never to an exception, because a throw inside the gate's
// effect would leave the gate in whatever state it started in, and the one state it must never start in is
// "granted".
import { describe, expect, it } from "vitest";
import {
  formatConsentPreference,
  parseConsentPreference,
} from "./consent-preference";

describe("consent preference — the format", () => {
  it("round-trips an accept", () => {
    const value = formatConsentPreference({
      choice: "accept_all",
      analyticsEnabled: true,
      marketingEnabled: true,
    });
    expect(parseConsentPreference(value)).toEqual({
      choice: "accept_all",
      analyticsEnabled: true,
      marketingEnabled: true,
    });
  });

  it("round-trips a reject — a recorded choice, not an absence (ADR-175 (b))", () => {
    const value = formatConsentPreference({
      choice: "reject_non_essential",
      analyticsEnabled: false,
      marketingEnabled: false,
    });
    expect(parseConsentPreference(value)).toEqual({
      choice: "reject_non_essential",
      analyticsEnabled: false,
      marketingEnabled: false,
    });
  });

  it("round-trips a custom pair", () => {
    const value = formatConsentPreference({
      choice: "custom",
      analyticsEnabled: true,
      marketingEnabled: false,
    });
    expect(parseConsentPreference(value)).toEqual({
      choice: "custom",
      analyticsEnabled: true,
      marketingEnabled: false,
    });
  });

  it("carries no identifier — the visitor id stays in the HttpOnly cookie", () => {
    const value = formatConsentPreference({
      choice: "accept_all",
      analyticsEnabled: true,
      marketingEnabled: true,
    });
    expect(value).toBe("accept_all.11");
  });
});

describe("consent preference — everything ambiguous is 'no answer'", () => {
  const notAnAnswer = [
    null,
    undefined,
    "",
    "accept_all",
    "accept_all.",
    "accept_all.1",
    "accept_all.111",
    "accept_all.1x",
    "yes_please.11",
    ".11",
    "accept_all.11.extra",
    "ACCEPT_ALL.11",
    " accept_all.11",
  ];
  for (const raw of notAnAnswer) {
    it(`refuses ${JSON.stringify(raw)}`, () => {
      expect(parseConsentPreference(raw)).toBeNull();
    });
  }

  it("refuses a value whose flags contradict the choice, rather than believing the flags", () => {
    // `0004`'s `cookie_consent_records_choice_flags_check` refuses this pairing in the database, so a cookie
    // carrying it did not come from a recorded choice. Believing the flags would let a hand-edited cookie
    // claim an accept the record never contained.
    expect(parseConsentPreference("accept_all.10")).toBeNull();
    expect(parseConsentPreference("reject_non_essential.01")).toBeNull();
  });

  it("refuses a custom value with both flags off or both on — those are the named choices", () => {
    expect(parseConsentPreference("custom.00")).toBeNull();
    expect(parseConsentPreference("custom.11")).toBeNull();
  });
});
