// The ledger port before boot installs the adapter: it refuses rather than half-recording a check (01 §4a
// rule 2: never a silent success). `verification` fails closed with it.
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
  list: async () => refuse(),
  recordDecision: async () => refuse(),
});
