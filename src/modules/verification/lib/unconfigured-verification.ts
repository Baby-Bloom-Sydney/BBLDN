// The binding before boot installs the inside: every road refuses rather than half-answering (01 §4a rule 2).
import { err } from "@/modules/platform";
import type { Verification, VerificationErrorDetails } from "../types";

const refuse = () =>
  err<VerificationErrorDetails>(
    "INTERNAL",
    "Verification is not available yet",
    {
      reason: "verification-not-configured",
    },
  );

export const unconfiguredVerification: Verification = Object.freeze({
  getStatus: async () => refuse(),
  submitContact: async () => refuse(),
  submitIdentity: async () => refuse(),
  submitDbs: async () => refuse(),
  submitRightToWork: async () => refuse(),
  submitSection: async () => refuse(),
  process: async () => refuse(),
  applyCheckResult: async () => refuse(),
  override: async () => refuse(),
});
