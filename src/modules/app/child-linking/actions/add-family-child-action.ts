"use server";

// S-N-01 (`03.19` Rejig; 04 §4.1 row 8, §4.4 c1) — "Add a family you already work for". One action for one
// decision: the guardian's permission is the condition of the whole thing, so the tick, the child row and the
// token she passes that family travel together rather than as three requests a user can abandon between.
//
// **Order, and why.** The tick is checked first and nothing is written without it (AGR-14 is the *condition*,
// not a receipt). The child is created next — unclaimed, with her as creator, which is what makes it hers to
// mint for (`0019`'s `children_stamp_creator` + the fourth arm of `user_has_child_access()`). AGR-14 is then
// recorded **against that child**, because a permission record that names no child is evidence of nothing. The
// token is minted last, and it is idempotent: asking twice for the same child hands back the same link, never
// a second one (02 §4.6 — no rotation).
//
// **If the AGR-14 record refuses, the child and the link still stand and the refusal is logged.** That is this
// module's standing rule ("the child is the fact") and the honest direction to fail in: losing the row she has
// just created, after the permission was actually given, would cost her the work and tell her nothing.
import { revalidatePath } from "next/cache";
import { log } from "@/modules/platform";
import type { ISODate, UserId } from "@/modules/shared-types";
import type { AddFamilyChildState } from "../types";
import { appActor } from "../lib/app-actor";
import { childLinking } from "../lib/default-child-linking";
import { consumeChildAddLimit } from "../lib/consume-child-add-limit";
import { isIsoDate } from "../lib/is-iso-date";
import { recordGuardianPermission } from "../lib/record-guardian-permission";

const refuse = (error: string): AddFamilyChildState => ({ url: null, error });

const NOT_HERS =
  "Sign in as a childcare professional to add a family you work for.";
const NO_PERMISSION =
  "Confirm you have this family's permission before you add their child.";
const BAD_DOB = "Give the child's date of birth as a date.";
// One line for "over the limit" and for "the limiter is down" alike: the difference is operational, and
// telling them apart is a probe (07 §8; 01 §4a rule 2).
const TOO_MANY = "That didn't go through — try again in a little while.";

export async function addFamilyChildAction(
  _state: AddFamilyChildState | null,
  form: FormData,
): Promise<AddFamilyChildState> {
  const actor = await appActor();
  if (actor === null || actor.kind !== "user" || actor.role !== "nanny")
    return refuse(NOT_HERS);
  // An unticked checkbox is absent; a tampered one can be present and empty. Both are "not confirmed".
  const permission = form.get("guardianPermission");
  if (typeof permission !== "string" || permission.length === 0)
    return refuse(NO_PERMISSION);

  // 01 §4a: validated **once, at the boundary**. Without this the string is cast to `ISODate` and reaches
  // `ageInMonths`, where a malformed value is `NaN` — and `NaN >= APP.maxChildAgeMonths` is `false`, so the
  // age cap silently passes and Postgres' `date` column becomes the only thing refusing it (`2g`'s security
  // pass, LOW-1).
  const dateOfBirth = String(form.get("dateOfBirth") ?? "");
  if (!isIsoDate(dateOfBirth)) return refuse(BAD_DOB);

  // 07 §8 row 17 — before any write, and before the consent record that would otherwise outlive a refusal.
  if (!(await consumeChildAddLimit(actor.id as UserId)))
    return refuse(TOO_MANY);

  const added = await childLinking.createChild(
    { firstName: String(form.get("firstName") ?? ""), dateOfBirth },
    actor,
  );
  if (!added.ok) return refuse(added.error.message);

  const consented = await recordGuardianPermission(
    actor.id as UserId,
    added.value.id,
  );
  if (!consented.ok)
    log.error("AGR-14 was given and not recorded", {
      module: "app",
      action: "addFamilyChild",
      surface: "S-N-01",
      childId: added.value.id as string,
      cause: consented.error,
    });

  const invite = await childLinking.createInvite(
    added.value.id,
    "nanny_to_parent",
    actor,
  );
  if (!invite.ok) return refuse(invite.error.message);

  revalidatePath("/nanny");
  return { url: invite.value.url, error: null };
}
