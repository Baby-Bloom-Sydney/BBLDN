// The undo of an upload whose submission then failed (07 §5.3 rule 3 "a failed registry write deletes the
// object"): best effort, every failure logged, never surfaced over the refusal the caller is already answering.
// `auth.data.removeObject` runs at service scope with no RLS behind it (ADR-155), so ownership is asserted HERE,
// before the port: only a path under the nanny's own prefix may be removed (security-reviewer M2) — a caller
// cannot hand this function another user's object, and a test pins it.
import { auth } from "@/modules/auth";
import { log } from "@/modules/platform";
import type { UserId } from "@/modules/shared-types";
import type { EvidenceRef } from "../types";

export async function removeEvidenceObjects(
  nannyId: UserId,
  refs: ReadonlyArray<EvidenceRef>,
): Promise<void> {
  for (const ref of refs) {
    if (!ref.path.startsWith(`${nannyId}/`)) {
      log.error("refused to remove an object outside the nanny's own prefix", {
        module: "verification",
        action: "removeEvidenceObjects",
        bucket: ref.bucket,
      });
      continue;
    }
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
