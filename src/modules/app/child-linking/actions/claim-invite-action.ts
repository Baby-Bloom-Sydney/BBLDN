"use server";

// S-P-14 / S-N-20's one action (`07.51`, `07.52`). Thin by design: the session is read here and nowhere else,
// the token comes from the form rather than from a client-supplied id, and everything that decides anything
// lives in `claimInvite`.
//
// On success the parent goes to the onboarding call (04 §6.1 S-P-14 → S-P-01, path E) and the nanny to her hub.
// Both are `redirect`s rather than a rendered "done" page, because the claim is a step in a journey and the
// next screen is the point of it.
import { redirect } from "next/navigation";
import { appActor } from "../lib/app-actor";
import { childLinking } from "../lib/default-child-linking";

export async function claimInviteAction(
  _state: { readonly error: string | null } | null,
  form: FormData,
): Promise<{ readonly error: string | null }> {
  const token = String(form.get("token") ?? "");
  const actor = await appActor();
  if (actor === null) redirect(`/login?redirect=/invite/connect/${token}`);

  const claimed = await childLinking.claimInvite(token, actor);
  if (!claimed.ok) return { error: claimed.error.message };
  redirect(
    claimed.value.direction === "nanny_to_parent" ? "/parent/call" : "/nanny",
  );
}
