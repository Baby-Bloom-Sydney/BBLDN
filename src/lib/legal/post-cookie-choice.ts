// The browser's half of recording a cookie choice (L-009 `3g`).
//
// **What changed, and why it is not a nicety.** `cookie-utils.recordCookieConsent` wrote the preference cookie
// itself, then fired the POST and ignored the answer — `catch {}` with the comment "non-blocking". So a limiter
// refusal, a 500, or an offline tab left the banner hidden, the toggles showing "saved", and **no consent record
// anywhere**. Under PECR the record is the whole point: we have to be able to show she was asked and what she
// answered, and a UI that says "saved" over a write that failed is worse than one that says nothing, because it
// is the one state nobody goes back to check.
//
// Now: the server writes the cookie on the response that recorded the row (`consent-preference-cookie.ts`), and
// this function reports whether that happened. A caller that gets `false` must keep asking. Still non-throwing —
// a banner that explodes at a person pressing Reject is its own kind of dark pattern — but a failure is now a
// value the caller has to handle rather than a silence it cannot see.
import { announceConsentChanged } from "./consent-changed-event";
import type { ConsentPreference } from "./consent-preference";

const ENDPOINT = "/api/legal/cookie-consent";

export async function postCookieChoice(
  preference: ConsentPreference,
): Promise<boolean> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The signed visitor cookie is HttpOnly, so the browser must be told to send it; without this the server
      // mints a new visitor on every choice and a person's second answer supersedes nothing.
      credentials: "same-origin",
      body: JSON.stringify({
        consent_choice: preference.choice,
        analytics_enabled: preference.analyticsEnabled,
        marketing_enabled: preference.marketingEnabled,
      }),
    });
    if (!response.ok) return false;
    // The gates read the cookie the response just set; this is what makes accept mount and withdraw unmount
    // without a reload (Art 7(3)).
    announceConsentChanged();
    return true;
  } catch {
    return false;
  }
}
