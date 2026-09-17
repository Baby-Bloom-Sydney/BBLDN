// **S-X-13** `/invite/[token]` — the child-invite public preview (04 §6.1). Thin: one server read, one
// component (05 §7 rule 5). The Sydney page this replaces reached `@/lib/actions/bapp/child-invites`,
// `@/lib/supabase/server` and an `invitesDisabled()` flag straight from the route; all three are gone.
//
// `noindex` + `no-referrer` are the two headers this route exists to set. A token in a `Referer` is a token in
// someone else's log, and 07 §8 row 7's defence — 32^8 plus a lockout, no expiry column — assumes tokens do
// not leak sideways.
import type { Metadata } from "next";
import { InviteLandingPage, loadInviteLanding } from "@/modules/app";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  const { view, token } = await loadInviteLanding(params.token);
  return <InviteLandingPage view={view} token={token} />;
}
