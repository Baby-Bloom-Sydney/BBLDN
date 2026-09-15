// The one value-shape heuristic behind the log scrubber (01 §4b) and the event props guard (03 §9.2 rule 3):
// email · phone number (9–15 digits, optionally spaced / dashed / bracketed — a uuid or a long numeric id has
// more) · JWT · provider secret prefix · bearer token. A uuid or an ISO instant / date is never PII-shaped.
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{7,}\d/g;
const PHONE_DIGITS_MIN = 9;
const PHONE_DIGITS_MAX = 15;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const PROVIDER_KEY = /^(sk|rk|pk|whsec|re)_[A-Za-z0-9]|^eyJ[A-Za-z0-9_-]{10,}/;
const BEARER = /^bearer\s/i;

const isPhoneLike = (value: string): boolean =>
  [...value.matchAll(PHONE_CANDIDATE)].some((match) => {
    const digits = match[0].replace(/\D/g, "").length;
    return digits >= PHONE_DIGITS_MIN && digits <= PHONE_DIGITS_MAX;
  });

export const looksLikePii = (value: string): boolean =>
  !UUID.test(value) &&
  (EMAIL.test(value) ||
    JWT.test(value) ||
    PROVIDER_KEY.test(value) ||
    BEARER.test(value) ||
    isPhoneLike(value));
