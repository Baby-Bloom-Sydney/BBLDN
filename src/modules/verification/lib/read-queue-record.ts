// S-A-16's open row (ADR-159): the ledger entry, the nanny's section states (the view) and the admin-only record
// (the base table: declared fields, object paths, the outcome, the cross-check, the Update Service columns) —
// never a URL. A reveal of the objects is `openEvidence`, which is the call that is audited (07 §4.32).
import { err, ok } from "@/modules/platform";
import type { Result, SubmissionId } from "@/modules/shared-types";
import { readSubmission } from "@/modules/vetting-providers";
import type {
  QueueRecord,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";
import { emptyVerificationState } from "./empty-verification-state";
import { queueEntryOf } from "./queue-entry-of";
import { requireAdmin } from "./require-admin";
import { sectionOfLedger } from "./section-of-ledger";

export async function readQueueRecord(
  deps: VerificationDeps,
  submissionId: SubmissionId,
): Promise<Result<QueueRecord, VerificationErrorDetails>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const entry = await readSubmission(submissionId);
  if (!entry.ok) return entry as Result<never, VerificationErrorDetails>;
  const section =
    entry.value === null ? null : sectionOfLedger(entry.value.section);
  if (entry.value === null || section === null)
    return err("VALIDATION", "That check is not available", {
      reason: "unsupported-evidence",
    });
  const [state, record] = await Promise.all([
    deps.store.getStatus(entry.value.nannyId),
    deps.store.readAdminRecord(entry.value.nannyId),
  ]);
  if (!state.ok) return state;
  if (!record.ok) return record;
  if (record.value === null)
    return err("VALIDATION", "That check is not available", {
      reason: "unsupported-evidence",
    });
  return ok({
    entry: queueEntryOf(entry.value, section),
    state: state.value ?? emptyVerificationState(entry.value.nannyId),
    record: record.value,
    ...(entry.value.note === undefined ? {} : { note: entry.value.note }),
  });
}
