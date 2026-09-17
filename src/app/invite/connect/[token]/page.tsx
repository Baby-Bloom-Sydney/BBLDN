// **S-P-14 / S-N-20** `/invite/connect/[token]` — the claim, for whoever is signed in (04 §6.1 / §6.5).
//
// It renders the **same view as S-X-13**, deliberately: the claim screen is the preview seen by a signed-in
// visitor, and writing it twice is how the two drift apart. The Sydney route this replaces was keyed on the
// invite row's uuid and redirected to the public landing after an admin-client lookup; 04 names this path by
// **token**, so the token is what it takes — and the redirect hop, which put the token in a `Location` header
// and then in the visitor's history, goes with it.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InviteLandingPage, loadInviteLanding } from "@/modules/app";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function InviteConnectPage({
  params,
}: {
  params: { token: string };
}) {
  const { view, token } = await loadInviteLanding(params.token);
  // Signed out on the claim route: the public preview is the right screen for that, and it is one URL back.
  if (view.kind === "open" && view.action.kind === "link")
    redirect(`/invite/${params.token}`);
  return <InviteLandingPage view={view} token={token} />;
}
