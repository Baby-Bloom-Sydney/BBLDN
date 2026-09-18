"use server";
// S-P-xx / S-N-xx "Delete my account" (07 §6.1). Thin by rule: the boundary takes no input at all — there is
// nothing to validate, because the subject is the session's and the only other thing a form could carry would be
// somebody else's id. `deleteMyAccount` does the gate, the budget and the job.
//
// The answer carries the outcome, so the screen can say what actually happened: erased, already erased, or
// refused with the reason. The sentences about what is retained come from `LEGAL.erasureRetains` (ADR-179), not
// from here.
import { toActionResult } from "@/modules/platform";
import type { DeleteMyAccountAction } from "../types";
import { deleteMyAccount } from "../lib/delete-my-account";

export const deleteMyAccountAction: DeleteMyAccountAction = async () =>
  toActionResult(await deleteMyAccount());
