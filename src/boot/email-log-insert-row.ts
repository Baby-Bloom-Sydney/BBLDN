// `CommsStore.record`'s input (a rendered email + its bookkeeping) → one `email_logs` row (02 §4.6; `0011`). Pure.
// `data` is left null: the renderer consumed the template data, and the rendered bodies are what the row keeps.
// Attachments have no column (02 §4.6 defines none) — recorded as a gap in the S5b PROGRESS entry, not hidden.
import type { AppDatabase } from "@/modules/auth";
import type { CommsStore } from "@/modules/comms";
import { toMessageStatusColumn } from "./to-message-status-column";

export type EmailLogInsertRow = AppDatabase["Tables"]["email_logs"]["Insert"];
type RecordInput = Parameters<CommsStore["record"]>[0];

export function emailLogInsertRow(input: RecordInput): EmailLogInsertRow {
  return Object.freeze({
    id: input.messageId,
    channel: input.channel,
    template_id: input.templateId,
    recipient_user_id: input.to.userId ?? null,
    recipient_email: input.to.email,
    subject: input.subject,
    body_html: input.html,
    body_text: input.text,
    status: toMessageStatusColumn(input.status),
    send_at: input.sendAt ?? null,
    dedupe_key: input.dedupeKey ?? null,
    from_key: input.from,
  });
}
