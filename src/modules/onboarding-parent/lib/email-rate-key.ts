// The rate-limit key for an address-keyed policy (07 §8 row 3, `key: "email-hash"`): the normalised address,
// **hashed**, joined to nothing else.
//
// Hashed for the reason `ip-key.ts` gives for an address: `rate_limit_buckets` (`0017`) carries no retention
// sweep, and an email address is personal data (07 §2 class C). The limiter only ever needs "the same address
// again", so a hash is enough and leaves nothing in the row to leak or to have to erase on request.
//
// The caller normalises first (trim + lower-case), so `Ada@Example.test` and `ada@example.test` cannot be two
// buckets for one account — which would hand an attacker twice the burst for nothing.
import type { Email } from "@/modules/shared-types";

/** Half a SHA-256, as `ip-key.ts` uses: ~2^64 of collision room, and half the row length. */
const KEY_LENGTH = 32;

export async function emailRateKey(email: Email): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, KEY_LENGTH);
}
