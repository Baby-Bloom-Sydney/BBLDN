"use server";

// S-P-13's "share your app with your nanny", and S-A-11's "create / resend on behalf" (`09.28`) — one action,
// because they are one rule: **mint if there is no pending row, hand back the existing link if there is.**
// There is no rotation, so "resend" cannot mean "new token" (memory: token stability), and a caller cannot use
// this to invalidate a link a recipient already holds.
import { revalidatePath } from "next/cache";
import type { ChildId } from "@/modules/shared-types";
import { appActor } from "../lib/app-actor";
import { childLinking } from "../lib/default-child-linking";

export async function createChildInviteAction(
  _state: { readonly url: string | null; readonly error: string | null } | null,
  form: FormData,
): Promise<{ readonly url: string | null; readonly error: string | null }> {
  const actor = await appActor();
  if (actor === null)
    return { url: null, error: "Sign in to share your child's app." };
  const childId = String(form.get("childId") ?? "") as ChildId;
  const direction =
    form.get("direction") === "nanny_to_parent"
      ? ("nanny_to_parent" as const)
      : ("parent_to_nanny" as const);

  const made = await childLinking.createInvite(childId, direction, actor);
  if (!made.ok) return { url: null, error: made.error.message };
  revalidatePath("/parent");
  return { url: made.value.url, error: null };
}
