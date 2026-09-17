// 07 §8 row 10 — the limit on S-X-23's contact form: 3 an hour, 10 a day, keyed `ip+email-hash`
// (`contact-form-key.ts` builds the key; this spends it).
//
// **Why it exists.** `sendContactMessageAction` is an anonymous `"use server"` export that turns one
// unauthenticated POST into an outbound email to `SENDERS.support`, with `replyTo` and the whole rendered body
// the submitter's. REVIEW-2 found it with no ceiling of any kind: a loop floods S-A-20 *and* spends the project's
// outbound quota, which takes the password-reset flow down with it — the one flow a locked-out parent needs.
//
// **Fails closed on a limiter outage.** ADR-134 lets only named unauthenticated *reads* fail open; this is a
// send, and fail-open here restores precisely the relay-with-no-ceiling the limit exists to stop.
//
// **Not the whole of row 10.** That row also asks for a honeypot field, which is a change to the form and its
// schema rather than to this action, and is recorded in `docs/review-sweep-170926.md` for `public-site` to own.
import { SECURITY } from "@/modules/config";
import { log, rateLimiter } from "@/modules/platform";

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
