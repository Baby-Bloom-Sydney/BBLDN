// The `trial-reminder` email (`08.09` / `08.32`; 03 §5.4.4 "T-5 London") — the operator's cue to call, and the
// parent's plain note that her month is ending. No countdown banner in-app (memory: no ambient banners).
import type { Comms } from "@/modules/comms";
import { log } from "@/modules/platform";
import type { FamilyId, Instant } from "@/modules/shared-types";
import { familyUuid } from "./family-uuid";
import type { FamilyContact } from "./spine-store";

export async function sendTrialReminder(
  comms: Pick<Comms, "send">,
  familyId: FamilyId,
  contact: FamilyContact | null,
  trialEndsAt: Instant,
): Promise<boolean> {
  if (contact === null || contact.email === null) {
    log.warn("trial-reminder not sent: no email on file", {
      module: "payments",
      action: "trial-reminder",
      userId: familyUuid(familyId),
    });
    return false;
  }
  const sent = await comms.send({
    channel: "email",
    templateId: "trial-reminder",
    to: { userId: contact.userId, email: contact.email },
    data: { firstName: contact.firstName ?? "", trialEndsAt },
    dedupeKey: `trial-reminder:${familyId}`,
  });
  if (!sent.ok)
    log.warn("trial-reminder not sent", {
      module: "payments",
      action: "trial-reminder",
      userId: familyUuid(familyId),
      errorCode: sent.error.code,
      reason: sent.error.details?.reason,
    });
  return sent.ok;
}
