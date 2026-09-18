// The `vetting.*` events 03 §4.4 assigns to this module, emitted for the nanny whose evidence moved. An emit that
// fails is logged and never fails the submission it describes (03 §9.2: the event log is a record, not a gate).
import { Events, log } from "@/modules/platform";
import type {
  Actor,
  EvidenceType,
  ProviderId,
  SubmissionId,
  UserId,
} from "@/modules/shared-types";

type VettingEventName =
  | "vetting.submitted"
  | "vetting.checked"
  | "vetting.needs-admin"
  | "vetting.decision-recorded";

export async function emitVettingEvent(
  name: VettingEventName,
  nannyId: UserId,
  props: {
    readonly submissionId: SubmissionId;
    readonly evidenceType: EvidenceType;
    readonly provider: ProviderId;
    readonly statusKind?: string;
    readonly decision?: string;
  },
  /** 03 §9.3: `vetting.decision-recorded` carries `actor admin, onBehalfOf nanny`; every other event is hers */
  actor: Actor = { kind: "user", id: nannyId, role: "nanny" },
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
