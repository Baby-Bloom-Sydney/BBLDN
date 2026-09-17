// S-X-13's one server read (05 §7 rule 5 — the route file is thin). Session → role, token → preview, and the
// two failure modes kept apart all the way to the view: a malformed token and a lookup that could not run are
// different from "that link is closed", and only the third is a statement about the invite.
//
// **The token is normalised before it is looked up.** A mistyped link never reaches Postgres and never spends
// one of 07 §8 row 7's five failed lookups, because it was never a lookup.
import { URLS } from "@/modules/config";
import { childLinking } from "./default-child-linking";
import { appActor } from "./app-actor";
import { inviteLandingView } from "./invite-landing-view";
import type { InviteLandingView } from "./invite-landing-view";
import { normaliseInviteToken } from "./normalise-invite-token";

export async function loadInviteLanding(
  rawToken: string,
): Promise<{
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
        signUpHref: "/signup",
        signInHref: "/login",
      }),
    };

  const preview = await childLinking.invitePreview(token);
  // The sign-up and sign-in links carry the token so the visitor lands back here after making an account
  // (04 §6.1: S-X-13 → S-X-06 / S-X-07 → the claim). `URLS.invite` is config's; the return path is built from
  // it rather than from a literal (L4).
  const back = encodeURIComponent(`${new URL(URLS.invite).pathname}/${token}`);
  return {
    token,
    view: inviteLandingView({
      preview: preview.ok ? preview.value : null,
      viewerRole,
      tokenWasMalformed: false,
      lookupFailed: !preview.ok,
      signUpHref: `/signup?invite=${token}&redirect=${back}`,
      signInHref: `/login?redirect=${back}`,
    }),
  };
}
