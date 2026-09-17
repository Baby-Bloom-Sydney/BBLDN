// `CommsStore.settle`'s `MessageState` → the `email_logs` UPDATE patch. The table's CHECKs demand a time beside
// the outcome (`sent` ⇒ `sent_at`, `failed` ⇒ `failed_at` — `0011`), so a `sent` without `sentAt` and every
// `failed` are stamped from the injected clock rather than left to violate the constraint.
import type { AppDatabase } from "@/modules/auth";
import type { MessageState } from "@/modules/comms";
import type { Instant } from "@/modules/shared-types";
import { toMessageStatusColumn } from "./to-message-status-column";

export type EmailLogUpdatePatch = AppDatabase["Tables"]["email_logs"]["Update"];

export function settlePatch(
  state: MessageState,
  now: Instant,
): EmailLogUpdatePatch {
  return Object.freeze({
    status: toMessageStatusColumn(state.status),
    ...(state.providerMessageId === undefined
      ? {}
      : { provider_message_id: state.providerMessageId }),
    ...(state.status === "sent" ? { sent_at: state.sentAt ?? now } : {}),
    ...(state.status === "failed" ? { failed_at: now } : {}),
  });
}
