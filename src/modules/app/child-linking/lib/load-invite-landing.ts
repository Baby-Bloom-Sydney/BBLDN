// S-X-13's one server read (05 §7 rule 5 — the route file is thin). Session → role, token → preview, and the
// two failure modes kept apart all the way to the view: a malformed token and a lookup that could not run are
// different from "that link is closed", and only the third is a statement about the invite.
//
// **The token is normalised before it is looked up.** A mistyped link never reaches Postgres and never spends
// one of 07 §8 row 7's five failed lookups, because it was never a lookup.
//
// ★ **07 §8 row 7's limiter is consumed here**, which is what makes 32^8 an enumeration argument rather than a
// number. Two counters: the ordinary rate before the lookup, and the failed-lookup counter after a **miss** —
// the latter is only ever reached by a caller who guessed, so a family following her own link never touches
// it. A refusal renders the "no longer open" screen: a blocked prober must not be able to tell a block from a
// dead token, which is the same reason claimed and revoked share one screen.
import { headers } from "next/headers";
import { URLS } from "@/modules/config";
import { consumeInviteLookupLimit } from "./consume-invite-lookup-limit";
import { inviteLookupKey } from "./invite-lookup-key";
import { childLinking } from "./default-child-linking";
import { appActor } from "./app-actor";
import { inviteLandingView } from "./invite-landing-view";
import type { InviteLandingView } from "./invite-landing-view";
import { normaliseInviteToken } from "./normalise-invite-token";

/** The one screen a refusal, a revoke and a made-up token all share (07 §8 row 7's no-enumeration rule). */
const closedView = (
  viewerRole: "parent" | "nanny" | "admin" | null,
): InviteLandingView =>
  inviteLandingView({
    preview: null,
    viewerRole,
    tokenWasMalformed: false,
    lookupFailed: false,
    signInHref: "/login",
  });

export async function loadInviteLanding(rawToken: string): Promise<{
  readonly view: InviteLandingView;
  readonly token: string | null;
}> {
  const token = normaliseInviteToken(rawToken);
  const actor = await appActor();
  const viewerRole =
    actor === null
      ? null
      : actor.kind === "admin"
        ? ("admin" as const)
        : actor.kind === "user"
          ? actor.role
          : null;

  if (token === null)
    return {
      token: null,
      view: inviteLandingView({
        preview: null,
        viewerRole,
        tokenWasMalformed: true,
        lookupFailed: false,
        signInHref: "/login",
      }),
    };

  const forwardedFor = headers().get("x-forwarded-for");
  const [rateKey, missKey] = await Promise.all([
    inviteLookupKey(forwardedFor, "invite-lookup"),
    inviteLookupKey(forwardedFor, "invite-miss"),
  ]);
  if ((await consumeInviteLookupLimit.before(rateKey)) === "limited")
    return { token: null, view: closedView(viewerRole) };

  const preview = await childLinking.invitePreview(token);
  // A miss is a guess. Spend one of the five, and once they are gone the hour-long window is the block.
  if (preview.ok && preview.value === null) {
    if ((await consumeInviteLookupLimit.afterMiss(missKey)) === "limited")
      return { token: null, view: closedView(viewerRole) };
  }
  // ADR-150 (REVIEW-2 M-8, kickoff debt 4): the token no longer travels in a query string. The sign-up road
  // is a **form** — `startInviteSignupAction` mints the `HttpOnly` invite cookie and sends the visitor to the
  // account form for her side — so `/signup` and `/login` carry nothing to log. The sign-in road keeps `next=`
  // (01 §4d's name; the invite cluster built a `redirect` parameter that S-X-08 never read, so the return was
  // silently dropped — HARDEN-B debt 10) pointing at the **claim** route, which 04 §2.3 addresses by token
  // anyway. `URLS.invite` is config's; the path is built from it rather than from a literal (L4).
  const back = encodeURIComponent(
    `${new URL(URLS.invite).pathname}/connect/${token}`,
  );
  return {
    token,
    view: inviteLandingView({
      preview: preview.ok ? preview.value : null,
      viewerRole,
      tokenWasMalformed: false,
      lookupFailed: !preview.ok,
      signInHref: `/login?next=${back}`,
    }),
  };
}
