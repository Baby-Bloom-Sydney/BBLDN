// The preference screen's read of the **record** (L-009 `3g`; `GET /api/legal/cookie-consent`).
//
// The screen could read the preference cookie instead, and that is exactly what the Sydney one did — badly: it
// initialised both toggles to `true` and then overwrote them from a client cookie, so a visitor who had never
// been asked was shown two ticked boxes. ADR-175 (a) forbids that, and pressing Save from that state would have
// recorded an acceptance she never gave.
//
// It reads the row instead of the cookie for a second reason: the cookie can outlive, predate or disagree with
// the record (a cleared jar, a second device, a lapsed window), and the screen whose job is to tell a person
// what we hold should show what we hold. `null` — no cookie, a forged one, a lapsed record, or a failed read —
// means "you have not chosen", and the toggles stay **off**, which is the safe direction in both senses: it
// never displays consent we cannot evidence, and it never pre-ticks.
import { parseConsentPreference } from "./consent-preference";
import type { ConsentPreference } from "./consent-preference";

const ENDPOINT = "/api/legal/cookie-consent";

export async function fetchCookieChoice(): Promise<ConsentPreference | null> {
  try {
    const response = await fetch(ENDPOINT, { credentials: "same-origin" });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return readChoice(body);
  } catch {
    return null;
  }
}

/**
 * The envelope is `{ ok: true, data: { choice, analyticsEnabled, marketingEnabled } }` (01 §4c) and `choice` is
 * `null` when she has not chosen. It is re-validated through the same parser the cookie goes through, so the
 * screen has exactly one definition of a well-formed answer and an unexpected body is "no answer" rather than a
 * half-read object.
 */
function readChoice(body: unknown): ConsentPreference | null {
  if (typeof body !== "object" || body === null) return null;
  const data = (body as { readonly data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const { choice, analyticsEnabled, marketingEnabled } = data as {
    readonly choice?: unknown;
    readonly analyticsEnabled?: unknown;
    readonly marketingEnabled?: unknown;
  };
  if (typeof choice !== "string") return null;
  const flag = (value: unknown) => (value === true ? "1" : "0");
  return parseConsentPreference(
    `${choice}.${flag(analyticsEnabled)}${flag(marketingEnabled)}`,
  );
}
