// One `email_logs` row → the `MessageState` `CommsStore.read` answers (03 §8.1 `status(messageId)`). Pure.
import type { AppDatabase } from "@/modules/auth";
import type { MessageState } from "@/modules/comms";
import type { IsoInstant } from "@/modules/shared-types";
import { fromMessageStatusColumn } from "./from-message-status-column";

type EmailLogRow = AppDatabase["Tables"]["email_logs"]["Row"];

export function messageStateFromRow(row: EmailLogRow): MessageState {
  return Object.freeze({
    status: fromMessageStatusColumn(row.status),
    ...(row.provider_message_id === null
      ? {}
      : { providerMessageId: row.provider_message_id }),
    ...(row.sent_at === null ? {} : { sentAt: row.sent_at as IsoInstant }),
  });
}
