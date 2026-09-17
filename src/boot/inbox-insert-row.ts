// `InboxMessage` (03 §8.1) → one `inbox_messages` row (02 §4.6 "Comms" row 2; `0011`). Pure. The actor's kind is the
// `mover` enum (`user` · `admin` · `system`); an admin acting on behalf carries the party in `on_behalf_of_user_id`
// (07 §5.4 row 6). The id is minted here so the caller gets it back whatever the driver echoes.
import type { AppDatabase } from "@/modules/auth";
import type { InboxMessage } from "@/modules/comms";
import type { Uuid } from "@/modules/shared-types";

export type InboxInsertRow = AppDatabase["Tables"]["inbox_messages"]["Insert"];

export function inboxInsertRow(msg: InboxMessage, id: Uuid): InboxInsertRow {
  return Object.freeze({
    id,
    user_id: msg.userId,
    type: msg.type,
    title: msg.title,
    body: msg.body,
    action_url: msg.actionUrl ?? null,
    reference_type: msg.reference?.type ?? null,
    reference_id: msg.reference?.id ?? null,
    actor: msg.actor.kind,
    on_behalf_of_user_id:
      msg.actor.kind === "admin" ? (msg.actor.onBehalfOf?.id ?? null) : null,
  });
}
