// 03 §7.2 — exclusions applied before any layer, in the contract's order; `quickMatch` stops after the first
// three (`withFamilyRule = false`). Returned, never dropped (03 §7.3).
import type { Candidate, ExclusionReason } from "../../types";

export function exclusionOf(
  candidate: Candidate,
  minVerificationLevel: number,
  withFamilyRule: boolean,
): ExclusionReason | null {
  if (candidate.isolated) return "ISOLATED";
  if (candidate.verificationLevel < minVerificationLevel)
    return "VERIFICATION_LEVEL";
  if (candidate.silentHold) return "SILENT_HOLD";
  if (withFamilyRule && candidate.activeConnectionWithFamily)
    return "ACTIVE_CONNECTION_WITH_FAMILY";
  return null;
}
