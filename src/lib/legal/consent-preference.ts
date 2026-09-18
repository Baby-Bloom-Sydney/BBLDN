// The value of the readable consent-preference cookie (`SECURITY.consentPreferenceCookie`; L-009 `3g`).
//
// **Why a format of its own rather than JSON.** The legacy `cookie-utils.ts` stored
// `encodeURIComponent(JSON.stringify(prefs))` and parsed it back with a bare `JSON.parse` inside a `try`. That
// shape has two problems this one does not: a partially-valid object parses (a `{analytics_enabled: true}` with
// no choice at all came back as a preference), and the parser's failure mode is "whatever `JSON.parse` threw",
// which the caller then has to remember to treat as "no answer".
//
// This value is the only thing standing between a visitor who has not answered and a tracker being mounted
// (ADR-175 (c)), so it is parsed the way a boundary is parsed: one shape, strictly matched, and **every** other
// input — absent, malformed, contradictory, hand-edited — is `null`, which the gate reads as "not granted".
//
// The flags are checked against the choice for the same reason `parse-cookie-choice.ts` checks them on the way
// in: `0004`'s `cookie_consent_records_choice_flags_check` refuses `accept_all` with analytics off, so a cookie
// carrying that pairing cannot have come from a recorded choice. Believing the flags over the choice would let
// a hand-edited cookie claim an acceptance the record never contained.
import type { CookieChoice } from "@/modules/platform";

export type ConsentPreference = {
  readonly choice: CookieChoice;
  readonly analyticsEnabled: boolean;
  readonly marketingEnabled: boolean;
};

/** `<choice>.<analytics><marketing>`, each flag `0` or `1`. No identifier, no whitespace, no JSON. */
const VALUE = /^(accept_all|reject_non_essential|custom)\.([01])([01])$/;

export function formatConsentPreference(preference: ConsentPreference): string {
  const flag = (on: boolean) => (on ? "1" : "0");
  return `${preference.choice}.${flag(preference.analyticsEnabled)}${flag(
    preference.marketingEnabled,
  )}`;
}

export function parseConsentPreference(
  raw: string | null | undefined,
): ConsentPreference | null {
  if (raw === null || raw === undefined) return null;
  const matched = VALUE.exec(raw);
  if (matched === null) return null;
  const choice = matched[1] as CookieChoice;
  const analyticsEnabled = matched[2] === "1";
  const marketingEnabled = matched[3] === "1";
  if (!agrees(choice, analyticsEnabled, marketingEnabled)) return null;
  return Object.freeze({ choice, analyticsEnabled, marketingEnabled });
}

/** The same rule `0004`'s CHECK and `parse-cookie-choice.ts` enforce, applied on the way back out. */
function agrees(
  choice: CookieChoice,
  analyticsEnabled: boolean,
  marketingEnabled: boolean,
): boolean {
  if (choice === "accept_all") return analyticsEnabled && marketingEnabled;
  if (choice === "reject_non_essential")
    return !analyticsEnabled && !marketingEnabled;
  // `custom` is the mixed answer, so a `custom` with both flags the same way is one of the named choices
  // wearing the wrong label — refused rather than silently re-labelled.
  return analyticsEnabled !== marketingEnabled;
}
