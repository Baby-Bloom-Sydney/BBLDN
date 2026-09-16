// Telling "there is no valid session" apart from "we could not reach the identity provider". The first is ordinary
// traffic — an expired cookie, a signed-out visitor — and reads as anonymous. The second is an incident, and must
// surface as `INTERNAL` rather than as a mass logout that looks exactly like everyone deciding to sign out at once.
// Supabase reports the first as a 4xx `AuthApiError` / `AuthSessionMissingError`; a network or upstream failure is
// `AuthRetryableFetchError` (status 0) or a 5xx, and an unrecognised shape is treated as the incident (fail closed).
const CLIENT_ERROR_MIN = 400;
const CLIENT_ERROR_MAX = 499;

export function isMissingSessionError(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status !== "number") return false;
  return status >= CLIENT_ERROR_MIN && status <= CLIENT_ERROR_MAX;
}
