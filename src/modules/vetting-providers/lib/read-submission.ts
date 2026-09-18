// One ledger row by id — what `verification.applyCheckResult` needs to know the section a result lands on.
import type { Result, SubmissionId } from "@/modules/shared-types";
import type { VettingErrorDetails, VettingLedgerEntry } from "../types";
import { VETTING_STORE_REGISTRY } from "./vetting-store-registry";

export function readSubmission(
  submissionId: SubmissionId,
): Promise<Result<VettingLedgerEntry | null, VettingErrorDetails>> {
  return VETTING_STORE_REGISTRY.get().read(submissionId);
}
