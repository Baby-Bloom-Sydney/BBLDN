// S-N-09 / the wizard's server read (05 §7 rule 5 — the route file is thin): the nanny's own state, or `null`
// when there is no session; a refused read is logged where it happened and shown as "nothing yet".
import { auth } from "@/modules/auth";
import { log } from "@/modules/platform";
import type { VerificationState } from "../types";
import { verification } from "./default-verification";

export async function loadVerificationStatus(): Promise<VerificationState | null> {
  const user = await auth.getCurrentUserId();
  if (!user.ok || user.value === null) return null;
  const read = await verification.getStatus(user.value);
  if (read.ok) return read.value;
  log.warn("verification status read refused", {
    module: "verification",
    action: "loadVerificationStatus",
    reason: read.error.details?.reason ?? read.error.code,
  });
  return null;
}
