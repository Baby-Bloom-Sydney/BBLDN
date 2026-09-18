// The `vetting.*` events 03 §4.4 assigns to this module, emitted for the nanny whose evidence moved. An emit that
// fails is logged and never fails the submission it describes (03 §9.2: the event log is a record, not a gate).
import { Events, log } from "@/modules/platform";
import type {
  Actor,
  EvidenceType,
  ProviderId,
  SubmissionId,
} from "@/modules/shared-types";

type VettingEventName =
  | "vetting.submitted"
  | "vetting.checked"
  | "vetting.needs-admin"
  | "vetting.decision-recorded";

export async function emitVettingEvent(
  name: VettingEventName,
  /**
   * ★ ADR-169 — who the event is ABOUT, as an `Actor` rather than as a loose id. It used to be a `UserId` from
   * which a default actor was built, and the one caller that could not supply a session id (`record`, which
   * reads the ledger and therefore holds a `nannies.id`) filled it with the party row — naming, in the audit
   * log, an id the audit log cannot be joined on. Making the actor explicit removes the slot the wrong id fits.
   */
  actor: Actor,
  props: {
    readonly submissionId: SubmissionId;
    readonly evidenceType: EvidenceType;
    readonly provider: ProviderId;
    readonly statusKind?: string;
    readonly decision?: string;
  },
): Promise<void> {
  const emitted = await Events.emit({
    name,
    actor,
    props,
  });
  if (!emitted.ok)
    log.warn("vetting event not recorded", {
      module: "vetting-providers",
      action: name,
      reason: emitted.error.details?.reason ?? emitted.error.code,
    });
}
