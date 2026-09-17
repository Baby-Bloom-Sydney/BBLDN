// The rate-limit key for 07 §8 row 10's contact-form limit, whose declared key is `ip+email-hash`.
//
// **Both halves, because neither alone is the abuse row 10 names:** one address submitted from a thousand IPs,
// and a thousand addresses submitted from one IP, are both the flood. Keying on either half alone leaves the
// other road open.
//
// **Both halves hashed**, for the reason `api/_lib/ip-key.ts` and `child-linking/lib/invite-lookup-key.ts` both
// give: `rate_limit_buckets` (`0017`) carries no retention sweep, and an IP and an email address are each
// personal data (07 §2 class C). The limiter only ever needs "the same caller again".
//
// The address is `x-forwarded-for`'s first entry — on Vercel the platform sets it and a client cannot forge past
// it. With no header every caller shares one bucket, which is the strict answer, not the lax one.
const NO_ADDRESS = "no-address";
/** Half a SHA-256 — ~2^64 of collision room, and half the row. */
const KEY_LENGTH = 32;

async function halfSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, KEY_LENGTH);
}

export async function contactFormKey(
  forwardedFor: string | null,
  email: string,
): Promise<string> {
  const address = (forwardedFor ?? "").split(",")[0]?.trim() ?? "";
  const [ip, addressee] = await Promise.all([
    address === "" ? Promise.resolve(NO_ADDRESS) : halfSha256(address),
    halfSha256(email.trim().toLowerCase()),
  ]);
  return `contact:${ip}:${addressee}`;
}
