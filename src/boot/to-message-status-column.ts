// `MessageStatus` (03 §8.1) → `message_status` (02 §3). The two disagree on one spelling — the contract's `dry-run`
// is the column's `dry_run` (comms README gap 2) — and this seam is where it is mapped, both ways
// (`from-message-status-column.ts`), so neither side is renamed to fit the other.
import type { MessageStatus } from "@/modules/comms";
import type { EnumValue } from "@/modules/shared-types";

export function toMessageStatusColumn(
  status: MessageStatus,
): EnumValue<"message_status"> {
  return status === "dry-run" ? "dry_run" : status;
}
