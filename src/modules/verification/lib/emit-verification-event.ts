// The `verification.*` events 03 §4.4 assigns to this module (`level-changed` · `held` · `released`) and the
// two admin-side `vetting.*` names it emits on behalf of the queue (`evidence-viewed`, 07 §4.32) and the expiry
// job (`expiry-approaching` · `expired`). A failed emit is logged and never fails the decision it describes
// (03 §9.2: the event log is a record, not a gate). One `verification.level-changed` per change (02 §4.3).
import { Events, log } from "@/modules/platform";
import type { EmitInput } from "@/modules/platform";

export async function emitVerificationEvent(input: EmitInput): Promise<void> {
  const emitted = await Events.emit(input);
  if (!emitted.ok)
    log.warn("verification event not recorded", {
      module: "verification",
      action: input.name,
      reason: emitted.error.details?.reason ?? emitted.error.code,
    });
}
