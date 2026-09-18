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
  // ★ ADR-169 — the admin record is keyed by the ledger's party id and carries her `auth.users.id` with it, so
  // the view read below (which keys on the session's id, R-7) is reached without a second guess about which id
  // this road is holding. Sequential rather than parallel for exactly that reason: the second read needs the
  // first one's answer.
  const record = await deps.store.readAdminRecord(entry.value.nannyId);
  if (!record.ok) return record;
  if (record.value === null)
    return err("VALIDATION", "That check is not available", {
      reason: "unsupported-evidence",
    });
  const state = await deps.store.getStatus(record.value.userId);
  if (!state.ok) return state;
  return ok({
    entry: queueEntryOf(entry.value, section),
    state: state.value ?? emptyVerificationState(record.value.userId),
    record: record.value,
    ...(entry.value.note === undefined ? {} : { note: entry.value.note }),
  });
}
