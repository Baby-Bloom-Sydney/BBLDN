// 07 §8 row 10 — the limit on S-X-23's contact form: 3 an hour, 10 a day, keyed by **IP + the submitted
// address**, which is exactly `SECURITY.rateLimits.contactForm.key` ("ip+email-hash").
//
// **Why it exists.** `sendContactMessageAction` is an anonymous `"use server"` export that turns one unauthenticated
// POST into an outbound email to `SENDERS.support`, with `replyTo` and the whole rendered body attacker-controlled.
// REVIEW-2 found it with no ceiling of any kind: a loop floods S-A-20 and spends the project's outbound quota,
// which takes the password-reset flow down with it — the one flow a locked-out parent needs.
//
// **Fails closed on a limiter outage.** ADR-134 lets only named unauthenticated *reads* fail open; this is a send,
// and fail-open here restores precisely the unbounded relay the limit exists to stop.
//
// **Not the whole of row 10.** That row also asks for a honeypot field, which is a change to the form and its
// schema rather than to this action, and is recorded in `docs/review-sweep-170926.md` for `public-site` to own.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";

/** Half a SHA-256, as `api/_lib/ip-key.ts` and `child-linking/lib/invite-lookup-key.ts` both use. */
const KEY_LENGTH = 32;
const NO_ADDRESS = "no-address";

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

/** `ip+email-hash`: neither half alone is enough — one address from many IPs, or many addresses from one IP, are
 *  both the flood row 10 names. Both halves are hashed; `rate_limit_buckets` has no retention job (07 §2 class C). */
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

export async function consumeContactFormLimit(key: string): Promise<boolean> {
  const consumed = await rateLimiter.consume(
    key,
    SECURITY.rateLimits.contactForm,
  );
  if (consumed.ok) return true;
  if (consumed.error.code === "RATE_LIMITED") {
    // The key is never logged (07 §8): it is derived from an address and an IP.
    log.warn("contact form over the limit; nothing sent", {
      module: "public-site",
      action: "sendContactMessage",
      surface: "S-X-23",
    });
    return false;
  }
  log.error("contact form: the limiter did not answer; refusing to send", {
    module: "public-site",
    action: "sendContactMessage",
    alert: "ALERT_PROVIDER_DOWN",
    provider: "supabase",
    surface: "S-X-23",
    reason: consumed.error.details?.reason ?? null,
  });
  return false;
}
