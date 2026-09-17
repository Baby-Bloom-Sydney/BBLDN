// The rate-limit key for 07 §8 row 2's funnel-step limit, whose declared key is `ip+ua`.
//
// **Both halves, because neither alone is row 2's abuse:** one browser rotating through addresses and one
// address running a thousand agents are both the flood, and keying on either half alone leaves the other road
// open. The user-agent half is weak on its own — it is caller-supplied and freely forged — which is exactly why
// it is joined to the address rather than trusted beside it.
//
// **Both halves hashed**, for the reason `api/_lib/ip-key.ts` gives: `rate_limit_buckets` (`0017`) carries no
// retention sweep, and an IP is personal data (07 §2 class C). The limiter only ever needs "the same caller
// again". **Never the `visitor_id`** (07 §2.9 / §8 row 4): that identifier is analytics-consent-gated, so keying
// a limit on it would make the limit depend on a cookie banner.
//
// The address is `x-forwarded-for`'s first entry — on Vercel the platform sets it and a client cannot forge past
// it. With no header every caller shares one bucket, which is the strict answer, not the lax one.
const NO_ADDRESS = "no-address";
const NO_AGENT = "no-agent";
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

export async function funnelStepKey(
  forwardedFor: string | null,
  userAgent: string | null,
): Promise<string> {
  const address = (forwardedFor ?? "").split(",")[0]?.trim() ?? "";
  const agent = (userAgent ?? "").trim();
  const [ip, ua] = await Promise.all([
    address === "" ? Promise.resolve(NO_ADDRESS) : halfSha256(address),
    agent === "" ? Promise.resolve(NO_AGENT) : halfSha256(agent),
  ]);
  return `funnel:${ip}:${ua}`;
}
