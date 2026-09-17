// What a URL segment is allowed to become before it is looked up (02 §4.6; 07 §8 row 7).
//
// Upper-cased, whitespace trimmed, and the hyphen re-inserted when the eight characters arrive without one —
// people retype these from a message. Anything else (wrong length, a dropped character, a Crockford
// confusable) is `null` rather than a repair, because repairing a typo turns it into a lookup against
// somebody else's live token. Every road into the invite cluster runs through here, so a malformed token
// never reaches Postgres and never reaches the rate limiter's failed-lookup counter as a real miss.
import { INVITE_TOKEN } from "./invite-token-alphabet";

export function normaliseInviteToken(raw: string): string | null {
  const bare = raw.trim().toUpperCase().replace(/-/g, "");
  if (bare.length !== INVITE_TOKEN.length) return null;
  const head = bare.slice(0, INVITE_TOKEN.group);
  const tail = bare.slice(INVITE_TOKEN.group);
  const candidate = `${head}-${tail}`;
  return INVITE_TOKEN.shape.test(candidate) ? candidate : null;
}
