// The one value-shape heuristic behind the log scrubber (01 §4b) and the event props guard (03 §9.2 rule 3):
// email · phone number (`phoneLikeRuns`) · JWT · provider secret prefix · bearer token. A uuid or an ISO instant
// / date is never PII-shaped. Whole-value checks: `EMAIL` matches anywhere, the rest anchor at the start, so a
// *message* is scrubbed token by token (`log/lib/scrub-message.ts`), never by this predicate alone.
import { phoneLikeRuns } from "./phone-like-runs";

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const PROVIDER_KEY = /^(sk|rk|pk|whsec|re)_[A-Za-z0-9]|^eyJ[A-Za-z0-9_-]{10,}/;
const BEARER = /^bearer\s/i;

export const looksLikePii = (value: string): boolean =>
  !UUID.test(value) &&
  (EMAIL.test(value) ||
    JWT.test(value) ||
    PROVIDER_KEY.test(value) ||
    BEARER.test(value) ||
    phoneLikeRuns(value).length > 0);
