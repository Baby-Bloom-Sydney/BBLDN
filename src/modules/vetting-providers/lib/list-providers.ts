// 03 §4.2 — what is bound right now, for the admin queue's per-tab "is this a manual provider?" question.
import { VETTING } from "@/modules/config";
import type { EvidenceType } from "@/modules/shared-types";
import type { ProviderSummary } from "../types";
import { stubManualProvider } from "../stub-manual";

export function listProviders(): ReadonlyArray<ProviderSummary> {
  const types = VETTING.acceptedEvidence as ReadonlyArray<EvidenceType>;
  return Object.freeze([
    {
      id: stubManualProvider.id,
      supports: types.filter((type) => stubManualProvider.supports(type)),
      manual: true,
    },
  ]);
}
