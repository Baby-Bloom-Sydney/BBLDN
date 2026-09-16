// 03 §4.2 — the provider for an evidence type, read from `config/vetting.ts` (05 §3 rule 1: the binding is
// config, never an import). Day one every type maps to `stub-manual` (03 §4.4); a Phase 2 swap changes the
// config row and nothing else.
import { VETTING } from "@/modules/config";
import { err, ok } from "@/modules/platform";
import type { EvidenceType, Result } from "@/modules/shared-types";
import type { VettingErrorDetails, VettingProvider } from "../types";
import { stubManualProvider } from "../stub-manual";

export function getProvider(
  evidenceType: EvidenceType,
): Result<VettingProvider, VettingErrorDetails> {
  const bound = VETTING.providers[evidenceType];
  if (bound === "stub-manual") return ok(stubManualProvider);
  return err("VALIDATION", "That check is not available", {
    reason: "unsupported-evidence",
    provider: bound,
  });
}
