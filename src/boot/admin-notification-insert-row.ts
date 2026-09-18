// `AdminNotificationInput` (03 §8.1; ADR-160) → one `admin_notifications` row (02 §4.6; `0011`). Pure. The id is
// minted here so the caller gets it back whatever the driver echoes; `emailed_*` and `acknowledged_*` stay null —
// the email is the delivery, this row the state, and the operator acknowledges from the queue.
import type { AppDatabase } from "@/modules/auth";
import type { AdminNotificationInput } from "@/modules/comms";
import type { Uuid } from "@/modules/shared-types";

export type AdminNotificationInsertRow =
  AppDatabase["Tables"]["admin_notifications"]["Insert"];

export function adminNotificationInsertRow(
  input: AdminNotificationInput,
  id: Uuid,
): AdminNotificationInsertRow {
  return Object.freeze({
    id,
    kind: input.kind,
    subject_type: input.subject?.type ?? null,
    subject_id: input.subject?.id ?? null,
    summary: input.summary,
    due_at: input.dueAt ?? null,
  });
}
