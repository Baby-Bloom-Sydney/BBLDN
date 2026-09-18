// One ledger row → the queue's own shape (ids and states, no name — the admin panel decorates, 03 §3.6). Pure.
import type { VettingLedgerEntry } from "@/modules/vetting-providers";
import type { QueueEntry, VerificationSection } from "../types";

export function queueEntryOf(
  entry: VettingLedgerEntry,
  section: VerificationSection,
): QueueEntry {
  return {
    submissionId: entry.submissionId,
    nannyId: entry.nannyId,
    section,
    evidenceType: entry.evidenceType,
    status: entry.status.kind,
    submittedAt: entry.submittedAt,
    ...(entry.checkedAt === undefined ? {} : { checkedAt: entry.checkedAt }),
  };
}
