"use server";

// The only invalidation path a child invite has (02 §4.6; memory: token stability). A revoked row is terminal:
// there is no un-revoke and no rotation, so the family mints a fresh invite if they change their mind, which is
// a new row with a new token and a visible trail.
import { revalidatePath } from "next/cache";
import type { InviteId } from "@/modules/shared-types";
import { appActor } from "../lib/app-actor";
import { childLinking } from "../lib/default-child-linking";

export async function revokeChildInviteAction(
  _state: { readonly error: string | null } | null,
  form: FormData,
): Promise<{ readonly error: string | null }> {
  const actor = await appActor();
  if (actor === null) return { error: "Sign in to close this link." };
  const inviteId = String(form.get("inviteId") ?? "") as InviteId;
  const done = await childLinking.revokeInvite(inviteId, "manual", actor);
  if (!done.ok) return { error: done.error.message };
  revalidatePath("/parent");
  return { error: null };
}
