"use server";

// S-P-14 / S-N-20's one action (`07.51`, `07.52`). Thin by design: the session is read here and nowhere else,
// the token comes from the form rather than from a client-supplied id, and everything that decides anything
// lives in `claimInvite`.
//
// On success the parent goes to the onboarding call (04 §6.1 S-P-14 → S-P-01, path E) and the nanny to her hub.
// Both are `redirect`s rather than a rendered "done" page, because the claim is a step in a journey and the
// next screen is the point of it.
//
// ★ **07 §8 row 7 is consumed here too (REVIEW-2, security HIGH-1).** `consume-invite-lookup-limit.ts` calls
// itself "the enumeration defence, and it is the whole of it", and it was consumed in exactly one place: the
// server-component GET in `load-invite-landing.ts`. This action is a `"use server"` export — an HTTP endpoint of
// its own — and it reached `store.invitePreview` through `claimInvite` with no counter. `carryLinkStoreError`
// answers a live token with one of four distinguishable sentences and a dead one with a fifth, so unlimited this
// is a token walker with a readable answer per guess, against a token with no expiry and no rotation (02 §4.6).
// The two counters are the landing page's, keyed the same way, so a guesser cannot buy a second budget by
// switching road. A refused claim spends a miss, because a refused claim is a guess.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { log } from "@/modules/platform";
import { appActor } from "../lib/app-actor";
import { consumeInviteLookupLimit } from "../lib/consume-invite-lookup-limit";
import { inviteLookupKey } from "../lib/invite-lookup-key";
import { normaliseInviteToken } from "../lib/normalise-invite-token";
import { childLinking } from "../lib/default-child-linking";

/** One sentence for every throttled or unavailable outcome: it must reveal nothing the guess was after. */
const HELD = "Too many attempts just now. Try again in a little while.";
/**
 * ADR-151 (REVIEW-2 M-1): one sentence for every refusal a non-holder can provoke. The inside keeps its named
 * reasons — they are logged and tested there — but the screen never learns whether the token was live, whose it
 * was, or which side of the app it served. Only an outage (INTERNAL) reads differently, because an outage is
 * not a statement about the invite.
 */
const CLOSED = "That link is no longer open.";

export async function claimInviteAction(
  _state: { readonly error: string | null } | null,
  form: FormData,
): Promise<{ readonly error: string | null }> {
  const token = String(form.get("token") ?? "");
  const actor = await appActor();
  // ★ M-7 (REVIEW-2). This spliced the **raw form string** into the URL; `normaliseInviteToken` runs later,
  // inside `claimInvite`, so a value carrying `?`, `#` or `&` reshaped the very parameter the login screen's
  // `safeNextPath` then consumes. Normalise first — 02 §4.6's `XXXX-XXXX` is the only shape that can ever be
  // looked up — then encode, as the sibling `post-signup-destination.ts` already does. A string that is not a
  // token is not carried at all: there is nothing to come back to.
  if (actor === null) {
    const clean = normaliseInviteToken(token);
    redirect(
      clean === null
        ? "/login"
        : `/login?next=${encodeURIComponent(`/invite/connect/${clean}`)}`,
    );
  }

  const forwardedFor = headers().get("x-forwarded-for");
  const [rateKey, missKey] = await Promise.all([
    inviteLookupKey(forwardedFor, "invite-lookup"),
    inviteLookupKey(forwardedFor, "invite-miss"),
  ]);
  if ((await consumeInviteLookupLimit.before(rateKey)) === "limited")
    return { error: HELD };

  const claimed = await childLinking.claimInvite(token, actor);
  if (!claimed.ok) {
    // A refusal is a guess that missed. Spend one of row 7's five; once they are gone the counter's own hour is
    // the block. An INTERNAL is our fault, not a guess, so it does not spend the caller's budget.
    if (claimed.error.code !== "INTERNAL")
      await consumeInviteLookupLimit.afterMiss(missKey);
    log.info("invite claim refused", {
      module: "app",
      action: "claimInvite",
      reason: claimed.error.details?.reason ?? null,
    });
    return {
      error: claimed.error.code === "INTERNAL" ? claimed.error.message : CLOSED,
    };
  }
  redirect(
    claimed.value.direction === "nanny_to_parent" ? "/parent/call" : "/nanny",
  );
}
