// The rate-limit key for an address-keyed policy (07 §8 row 2, `key: "email-hash"`): the normalised address,
// **hashed**, joined to nothing else — an email address is personal data (07 §2 class C) and the limiter only
// ever needs "the same address again". The caller normalises first (trim + lower-case).
import type { Email } from "@/modules/shared-types";

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
