// The browser's read of the consent-preference cookie (L-009 `3g`). One export, one job: answer what this
// visitor chose, or `null` for "she has not chosen".
//
// It runs in an effect, never during render, and the caller's initial state is always "not granted" — so on the
// server, on the first paint, and on any browser that hands us nothing readable, the answer is the same and
// nothing non-essential mounts. `document` is guarded rather than assumed for the same reason: this module is
// imported by a client component that Next also renders on the server.
import { SECURITY } from "@/modules/config";
import {
  parseConsentPreference,
  type ConsentPreference,
} from "./consent-preference";

export function readConsentPreference(): ConsentPreference | null {
  if (typeof document === "undefined") return null;
  const name = SECURITY.consentPreferenceCookie.name;
  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (raw === undefined) return null;
  return parseConsentPreference(decode(raw));
}

/**
 * `decodeURIComponent` throws `URIError` on a malformed percent-sequence, and a cookie jar can hold anything a
 * previous version of the site (or a person with devtools) put in it. The same lesson as `visitor-cookie.ts`'s
 * security HIGH, one layer out: a value we cannot decode is a value we did not write.
 */
function decode(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
