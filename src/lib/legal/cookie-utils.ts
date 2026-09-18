export const COOKIE_KEY = "baby_bloom_consent_preferences";
export const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 12 months in seconds

export interface CookiePrefs {
  consent_choice: "accept_all" | "reject_non_essential" | "custom";
  analytics_enabled: boolean;
  marketing_enabled: boolean;
}

export function getCookiePrefs(): CookiePrefs | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_KEY}=`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.split("=")[1]));
  } catch {
    return null;
  }
}

export function setCookiePrefs(prefs: CookiePrefs) {
  const value = encodeURIComponent(JSON.stringify(prefs));
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  try {
    localStorage.setItem(COOKIE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore
  }
}

/**
 * `getVisitorId()` is **gone, deliberately** (L-009 `3e`). It minted a uuid in `localStorage` and sent it in
 * the request body, which let any caller name any visitor — including a real one, whose current consent row it
 * would then collide with. The id is now minted server-side and carried in an `HttpOnly`, signed cookie, so
 * this file cannot read it and does not need to: `credentials: "same-origin"` sends the cookie, and the
 * response's `Set-Cookie` issues one on a first visit.
 *
 * Still non-blocking on a network failure — a banner that throws at a person choosing "reject" is worse than
 * one that retries on her next page — but a refusal is now a *recorded* refusal on the server's side, not a
 * `23505` from a unique index (`0004`) that made a second choice impossible.
 */
export async function recordCookieConsent(prefs: CookiePrefs) {
  try {
    await fetch("/api/legal/cookie-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(prefs),
    });
  } catch {
    // Non-blocking
  }
}
