// The undo of an upload whose submission then failed (07 §5.3 rule 3 "a failed registry write deletes the
// object"): best effort, every failure logged, never surfaced over the refusal the caller is already answering.
import { auth } from "@/modules/auth";
import { log } from "@/modules/platform";
import type { EvidenceRef } from "../types";

export async function removeEvidenceObjects(
  refs: ReadonlyArray<EvidenceRef>,
): Promise<void> {
  for (const ref of refs) {
    const removed = await auth.data.removeObject(ref);
    if (!removed.ok)
      log.warn("evidence object left behind after a failed submission", {
        module: "verification",
        action: "removeEvidenceObjects",
        bucket: ref.bucket,
        reason: removed.error.details?.reason ?? removed.error.code,
      });
  }
}
