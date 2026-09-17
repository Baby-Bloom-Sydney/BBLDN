// The rate-limit key for an IP-keyed policy (07 §8 rows 1, 3, 5): the caller's address, **hashed**, joined to
// nothing else.
//
// Hashed because `rate_limit_buckets` (`0017`) is a table with no retention job on it and an IP is personal data
// (07 §2 class C). A hash is enough for the limiter — it only ever needs to know "the same caller again" — and
// leaves nothing in the row to leak or to have to erase on request.
//
// **Never the `visitor_id`** (07 §2.9 / §8 row 4, fix: S-6): that identifier is analytics-consent-gated, so
// keying a limit on it would make the limit depend on a cookie banner.
//
// The address comes from `x-forwarded-for`'s first entry — on Vercel the platform sets it and a client cannot
// forge past it. Off Vercel (a local run, a test) there is no header and every caller shares one bucket, which
// is the strict answer, not the lax one.
const FORWARDED_FOR = "x-forwarded-for";
const NO_ADDRESS = "no-address";
/** Half a SHA-256 is ~2^64 of collision room — far beyond the key space of IPv4 + IPv6, and half the row. */
const KEY_LENGTH = 32;

export async function ipKeyOf(request: Request): Promise<string> {
  const forwarded = request.headers.get(FORWARDED_FOR);
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
