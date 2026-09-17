// "Your app is ready" (`08.42`; 03 §5.4.3) to the parent. Sent by `payments`, never by `access-gate` (fix: A-3).
// Comms failing closed (no renderer, no provider) does not fail the money transition: the row is written, the
// email is a consequence — logged with the reason, retried by hand from the admin timeline.
import type { Comms } from "@/modules/comms";
import { log } from "@/modules/platform";
import type { FamilyId } from "@/modules/shared-types";
import { familyUuid } from "./family-uuid";
import type { FamilyContact } from "./spine-store";

export async function sendAppReady(
  comms: Pick<Comms, "send">,
  familyId: FamilyId,
  contact: FamilyContact | null,
): Promise<void> {
  if (contact === null || contact.email === null) {
    log.warn("app-ready not sent: no email on file", {
      module: "payments",
      action: "app-ready",
      userId: familyUuid(familyId),
    });
    return;
  }
  const sent = await comms.send({
    channel: "email",
    templateId: "app-ready",
    to: { userId: contact.userId, email: contact.email },
    data: { firstName: contact.firstName ?? "" },
    dedupeKey: `app-ready:${familyId}`,
  });
  if (!sent.ok)
    log.warn("app-ready not sent", {
      module: "payments",
      action: "app-ready",
      userId: familyUuid(familyId),
      errorCode: sent.error.code,
      reason: sent.error.details?.reason,
    });
}
