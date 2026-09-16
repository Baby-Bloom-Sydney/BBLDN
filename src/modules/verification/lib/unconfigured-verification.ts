// ADR-117 Tier A — the inside of this module handles criminal-record checks, identity documents and
// right-to-work evidence, and is deliberately not built by this unit. The binding refuses rather than
// half-answering (01 §4a rule 2).
import { err } from "@/modules/platform";
import type { Verification, VerificationErrorDetails } from "../types";

const refuse = () =>
  err<VerificationErrorDetails>(
    "INTERNAL",
    "Verification is not available yet",
    { reason: "verification-not-configured" },
  );

export const unconfiguredVerification: Verification = Object.freeze({
  getStatus: async () => refuse(),
  submitSection: async () => refuse(),
  applyCheckResult: async () => refuse(),
  override: async () => refuse(),
});
