// S-A-16's list (03 §4.3 "lists sections in `needs-admin` or stale `pending`"; ADR-159): the ledger rows of one
// tab awaiting a person, or the ones a provider has held `pending` longer than the stale window — ids and states
// only; the admin panel decorates a name from `auth` (03 §3.6). An admin's read: the gate is the connector's own.
import { VETTING } from "@/modules/config";
import { ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import { listSubmissions } from "@/modules/vetting-providers";
import type {
  QueueEntry,
  QueueQuery,
  VerificationErrorDetails,
} from "../types";
import { ledgerSectionOf } from "./ledger-section-of";
import { queueEntryOf } from "./queue-entry-of";
import { requireAdmin } from "./require-admin";

const MINUTE_MS = 60_000;

export async function listQueue(
  query: QueueQuery,
  now: number = Date.now(),
): Promise<Result<ReadonlyArray<QueueEntry>, VerificationErrorDetails>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const listed = await listSubmissions({
    section: ledgerSectionOf(query.tab),
    status: query.filter === "needs-admin" ? "needs-admin" : "pending",
  });
  if (!listed.ok) return listed as Result<never, VerificationErrorDetails>;
  const cutoff = now - VETTING.staleProcessingMinutes * MINUTE_MS;
  const rows =
    query.filter === "needs-admin"
      ? listed.value
      : listed.value.filter((entry) => Date.parse(entry.submittedAt) < cutoff);
  return ok(
    [...rows]
      .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1))
      .map((entry) => queueEntryOf(entry, query.tab)),
  );
}
