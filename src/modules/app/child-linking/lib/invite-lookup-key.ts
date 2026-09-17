// The rate-limit key for the invite lookup (07 §8 row 7 — keyed by IP). The same rule as the API tree's
// `ip-key.ts`, written here because a server component has `headers()` rather than a `Request`, and because a
// second copy of the *rule* would be worse than a second copy of the twenty lines that express it.
//
// **Hashed**, because `rate_limit_buckets` (`0017`) has no retention job and an IP is personal data (07 §2
// class C). The limiter only ever needs "the same caller again". **Never the `visitor_id`** (07 §2.9 / §8 row
// 4): that identifier is analytics-consent-gated, so keying a limit on it would make the limit depend on a
// cookie banner.
//
// The address is `x-forwarded-for`'s first entry — on Vercel the platform sets it and a client cannot forge
// past it. Off Vercel there is no header and every caller shares one bucket, which is the strict answer.
const NO_ADDRESS = "no-address";
/** Half a SHA-256 — ~2^64 of collision room, far beyond the IPv4 + IPv6 key space, and half the row. */
const KEY_LENGTH = 32;

export async function inviteLookupKey(
  forwardedFor: string | null,
  prefix: string,
): Promise<string> {
  const address = (forwardedFor ?? "").split(",")[0]?.trim() ?? "";
  if (address === "") return `${prefix}:${NO_ADDRESS}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(address),
  );
  const hashed = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, KEY_LENGTH);
  return `${prefix}:${hashed}`;
}
