// ADR-117 Tier A — the submission store is deliberately **not built** by this unit: it is the path that would
// hold DBS, identity-document and right-to-work evidence. It refuses until a reviewed unit installs it, so no
// code can begin persisting evidence by accident (01 §4a rule 2: never a silent success).
import { err } from "@/modules/platform";
import type { VettingErrorDetails, VettingSubmissionStore } from "../types";

const refuse = () =>
  err<VettingErrorDetails>("INTERNAL", "Verification is not available yet", {
    reason: "vetting-store-not-configured",
  });

export const unconfiguredVettingStore: VettingSubmissionStore = Object.freeze({
  upsert: async () => refuse(),
  findByEvidence: async () => refuse(),
  read: async () => refuse(),
  recordDecision: async () => refuse(),
});
