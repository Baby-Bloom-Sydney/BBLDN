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
  // the queue's road + the named jobs (2c; ADR-159 / ADR-161)
  listQueue: (query) => VERIFICATION_REGISTRY.get().listQueue(query),
  readQueueRecord: (submissionId) =>
    VERIFICATION_REGISTRY.get().readQueueRecord(submissionId),
  openEvidence: (submissionId) =>
    VERIFICATION_REGISTRY.get().openEvidence(submissionId),
  decide: (input) => VERIFICATION_REGISTRY.get().decide(input),
  recordUpdateServiceCheck: (input) =>
    VERIFICATION_REGISTRY.get().recordUpdateServiceCheck(input),
  adminOverview: () => VERIFICATION_REGISTRY.get().adminOverview(),
  sweepStaleProcessing: (now) =>
    VERIFICATION_REGISTRY.get().sweepStaleProcessing(now),
  sweepReminders: (now) => VERIFICATION_REGISTRY.get().sweepReminders(now),
  sweepExpiry: (now) => VERIFICATION_REGISTRY.get().sweepExpiry(now),
});
