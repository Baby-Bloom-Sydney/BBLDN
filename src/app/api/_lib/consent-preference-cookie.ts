// The `Set-Cookie` value for the readable consent-preference cookie (L-009 `3g`; `SECURITY.consentPreferenceCookie`).
//
// It is written **only** on the response that recorded the choice, which is the property that matters: the
// browser's copy is a mirror of a row that exists, not a claim the browser made. The old
// `cookie-utils.setCookiePrefs` wrote it from the client *before* the POST and never checked the answer, so a
// refused write — a limiter refusal, a 500, an offline tab — left the banner hidden and a preference recorded
// nowhere. That failure mode is gone by construction: the header cannot be sent by anything but a successful
// write.
//
// Not `HttpOnly`, and that is the point — the gate in the browser has to read it (ADR-175 (c)). It carries no
// identifier, so there is nothing in it for a script to steal. `Secure` outside development, matching
// `visitor-cookie.ts`; `SameSite=Lax` because, unlike the visitor cookie, this one **is** read on the arriving
// navigation.
import { SECURITY, publicEnv } from "@/modules/config";
import {
  formatConsentPreference,
  type ConsentPreference,
} from "@/lib/legal/consent-preference";

const COOKIE = SECURITY.consentPreferenceCookie;

export function consentPreferenceHeader(preference: ConsentPreference): string {
  const parts = [
    `${COOKIE.name}=${encodeURIComponent(formatConsentPreference(preference))}`,
    "Path=/",
    `Max-Age=${COOKIE.maxAgeSeconds}`,
    "SameSite=Lax",
  ];
  if (publicEnv.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
