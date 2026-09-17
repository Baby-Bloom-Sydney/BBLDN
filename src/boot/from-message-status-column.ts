// `message_status` (02 §3) → `MessageStatus` (03 §8.1): the twin of `to-message-status-column.ts`.
import type { MessageStatus } from "@/modules/comms";
import type { EnumValue } from "@/modules/shared-types";

export function fromMessageStatusColumn(
  status: EnumValue<"message_status">,
): MessageStatus {
  return status === "dry_run" ? "dry-run" : status;
}
