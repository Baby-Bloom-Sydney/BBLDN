// The rate-limit key for the IP-keyed halves of 07 §8 rows 2 and 3 (`signupPerIp`, `authPerIp`): the caller's
// address, **hashed**, joined to nothing else.
//
// **Why it is taken here at all.** Both rows key on `IP` beside the address, and the per-IP half was left to "the
// edge layer in front of the function" — an argument ADR-140 struck for the fail-open case and which is no
// stronger here: `vercel.json` carries no firewall rule, so a per-IP ceiling that lives only at the edge does not
// exist. The email-hash half stops one address being hammered; this half is what stops one machine working
// through a list of addresses, which is the other road entirely.
//
// Hashed for the reason `api/_lib/ip-key.ts` gives: `rate_limit_buckets` (`0017`) carries no retention sweep and
// an IP is personal data (07 §2 class C). The limiter only ever needs "the same caller again".
//
// The address is `x-forwarded-for`'s first entry — on Vercel the platform sets it and a client cannot forge past
// it. `headers()` throws outside a request scope (a unit test driving an action directly) and these actions never
// throw, so a missing scope degrades to one shared bucket: the strict answer, not the lax one.
import { headers } from "next/headers";

const NO_ADDRESS = "no-address";
/** Half a SHA-256, as `ip-key.ts` uses: ~2^64 of collision room, and half the row length. */
const KEY_LENGTH = 32;

export async function callerIpKey(): Promise<string> {
  let forwarded: string | null = null;
  try {
    forwarded = headers().get("x-forwarded-for");
  } catch {
    forwarded = null;
  }
  const address = (forwarded ?? "").split(",")[0]?.trim() ?? "";
  if (address === "") return NO_ADDRESS;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(address),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, KEY_LENGTH);
}
