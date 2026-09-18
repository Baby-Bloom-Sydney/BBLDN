// The inside, assembled over its two ports (ADR-154; ADR-155): the store (0022's definers + the view read, or
// the memory double) and the injected contact writer. Every method is one file; this is the join.
import { err } from "@/modules/platform";
import type { CheckResult, Evidence } from "@/modules/shared-types";
import { readSubmission } from "@/modules/vetting-providers";
import type {
  Verification,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";
import { adminOverview } from "./admin-overview";
import { decide } from "./decide";
import { emptyVerificationState } from "./empty-verification-state";
import { listQueue } from "./list-queue";
import { openEvidence } from "./open-evidence";
import { processSections } from "./process-sections";
import { readQueueRecord } from "./read-queue-record";
import { recordUpdateServiceCheck } from "./record-update-service-check";
import { sweepExpiry } from "./sweep-expiry";
import { sweepReminders } from "./sweep-reminders";
import { sweepStaleProcessing } from "./sweep-stale-processing";
import { requireOwnNanny } from "./require-own-nanny";
import { submitContact } from "./submit-contact";
import { submitDbs } from "./submit-dbs";
import { submitEvidence } from "./submit-evidence";
import { submitIdentity } from "./submit-identity";
import { submitRightToWork } from "./submit-right-to-work";
import { sectionOfLedger } from "./section-of-ledger";
import { sectionOfEvidenceType } from "@/modules/vetting-providers";

export function createVerification(deps: VerificationDeps): Verification {
  const getStatus: Verification["getStatus"] = async (nannyId) => {
    const read = await deps.store.getStatus(nannyId);
    if (!read.ok) return read;
    return { ok: true, value: read.value ?? emptyVerificationState(nannyId) };
  };
  const inside: Verification = {
    getStatus,
    submitContact: (nannyId, input) => submitContact(deps, nannyId, input),
    submitIdentity: (nannyId, input) => submitIdentity(deps, nannyId, input),
    submitDbs: (nannyId, input) => submitDbs(deps, nannyId, input),
    submitRightToWork: (nannyId, input) =>
      submitRightToWork(deps, nannyId, input),
    submitSection: async (evidence: Evidence) => {
      const own = await requireOwnNanny(evidence.nannyId);
      if (!own.ok) return own;
      const section = sectionOfLedger(sectionOfEvidenceType(evidence.type));
      if (section === null)
        return err("VALIDATION", "That evidence is not accepted", {
          reason: "unsupported-evidence",
        });
      return submitEvidence(
        deps.store,
        evidence.nannyId,
        section,
        [evidence],
        [],
        async () => undefined,
      );
    },
    process: (nannyId) => processSections(deps, nannyId),
    applyCheckResult: async (result: CheckResult) => {
      const entry = await readSubmission(result.submissionId);
      if (!entry.ok)
        return err("INTERNAL", "That check could not be recorded.", {
          reason: "store-failed",
        });
      if (entry.value === null)
        return err("VALIDATION", "That check is not available", {
          reason: "unsupported-evidence",
        });
      const applied = await deps.store.applyCheckResult({
        submissionId: result.submissionId,
        status: result.status,
        checkedBy: "none",
        ...(result.extracted === undefined
          ? {}
          : { extracted: result.extracted }),
      });
      if (!applied.ok) return applied;
      return getStatus(entry.value.nannyId);
    },
    // 03 §4.3's arm for a provider that is not a `ManualDecisionProvider` — none is bound (03 §4.4), so it stays
    // refused by name; `decide` is the road the queue takes (ADR-159).
    override: async () =>
      err<VerificationErrorDetails>(
        "INTERNAL",
        "That decision road is not built yet.",
        { reason: "not-built" },
      ),
    listQueue: (query) => listQueue(query),
    readQueueRecord: (submissionId) => readQueueRecord(deps, submissionId),
    openEvidence: (submissionId) => openEvidence(deps, submissionId),
    decide: (input) => decide(deps, input),
    recordUpdateServiceCheck: (input) => recordUpdateServiceCheck(deps, input),
    adminOverview: () => adminOverview(deps),
    sweepStaleProcessing: (now) => sweepStaleProcessing(deps, now),
    sweepReminders: (now) => sweepReminders(deps, now),
    sweepExpiry: (now) => sweepExpiry(deps, now),
  };
  return Object.freeze(inside);
}
