// S-N-04 (03 §4.3 "`verification.submitContact` (no provider)"): the values go through the injected writer
// (`update_nanny_profile(p_contact)`, R-7), then the section is stamped (`save_verification_contact()`).
import { err } from "@/modules/platform";
import type { Result, UserId } from "@/modules/shared-types";
import type {
  ContactInput,
  SectionState,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";
import { requireOwnNanny } from "./require-own-nanny";
import { sectionStateOf } from "./section-state-of";

export async function submitContact(
  deps: VerificationDeps,
  nannyId: UserId,
  input: ContactInput,
): Promise<Result<SectionState, VerificationErrorDetails>> {
  const own = await requireOwnNanny(nannyId);
  if (!own.ok) return own;
  const written = await deps.contactWriter(input);
  if (!written.ok)
    return err(
      "INTERNAL",
      "We couldn't save that just now. Try again in a moment.",
      {
        reason: "store-failed",
      },
    );
  const stamped = await deps.store.saveContact();
  if (!stamped.ok) return stamped;
  const state = await deps.store.getStatus(nannyId);
  if (!state.ok) return state;
  return { ok: true, value: sectionStateOf(state.value, "contact") };
}
