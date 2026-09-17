"use server";

// `07.50` — the add-a-child step. The same action backs the card on `/parent` and the step at the end of
// signup (BAI's ruling: one rule, two entry points), which is why it takes a form and nothing else: whichever
// screen submits it, the family, the trial and the access window move the same way.
import { revalidatePath } from "next/cache";
import type { ISODate } from "@/modules/shared-types";
import { appActor } from "../lib/app-actor";
import { childLinking } from "../lib/default-child-linking";

export async function createChildAction(
  _state: { readonly error: string | null } | null,
  form: FormData,
): Promise<{ readonly error: string | null }> {
  const actor = await appActor();
  if (actor === null) return { error: "Sign in to add your child." };
  const added = await childLinking.createChild(
    {
      firstName: String(form.get("firstName") ?? ""),
      dateOfBirth: String(form.get("dateOfBirth") ?? "") as ISODate,
    },
    actor,
  );
  if (!added.ok) return { error: added.error.message };
  revalidatePath("/parent");
  return { error: null };
}
