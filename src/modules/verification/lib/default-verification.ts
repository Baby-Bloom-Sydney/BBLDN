// The module-level `verification` that `onboarding-nanny` and `admin-verification` import (01 §2.3).
import type { Verification } from "../types";
import { VERIFICATION_REGISTRY } from "./verification-registry";

export const verification: Verification = Object.freeze({
  getStatus: (nannyId) => VERIFICATION_REGISTRY.get().getStatus(nannyId),
  submitSection: (evidence) =>
    VERIFICATION_REGISTRY.get().submitSection(evidence),
  applyCheckResult: (result) =>
    VERIFICATION_REGISTRY.get().applyCheckResult(result),
  override: (nannyId, decision) =>
    VERIFICATION_REGISTRY.get().override(nannyId, decision),
});
