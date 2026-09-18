// The module-level `verification` that `onboarding-nanny` and `admin-verification` import (01 §2.3). Re-reads the
// registry on every call so `configureVerification` at boot reaches every earlier importer.
import type { Verification } from "../types";
import { VERIFICATION_REGISTRY } from "./verification-registry";

export const verification: Verification = Object.freeze({
  getStatus: (nannyId) => VERIFICATION_REGISTRY.get().getStatus(nannyId),
  submitContact: (nannyId, input) =>
    VERIFICATION_REGISTRY.get().submitContact(nannyId, input),
  submitIdentity: (nannyId, input) =>
    VERIFICATION_REGISTRY.get().submitIdentity(nannyId, input),
  submitDbs: (nannyId, input) =>
    VERIFICATION_REGISTRY.get().submitDbs(nannyId, input),
  submitRightToWork: (nannyId, input) =>
    VERIFICATION_REGISTRY.get().submitRightToWork(nannyId, input),
  submitSection: (evidence) =>
    VERIFICATION_REGISTRY.get().submitSection(evidence),
  process: (nannyId) => VERIFICATION_REGISTRY.get().process(nannyId),
  applyCheckResult: (result) =>
    VERIFICATION_REGISTRY.get().applyCheckResult(result),
  override: (nannyId, decision) =>
    VERIFICATION_REGISTRY.get().override(nannyId, decision),
});
