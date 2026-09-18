// The messages a K row sends (03 §8.3), sent **after** the write and never inside it.
//
// Why outside: `advance` is atomic per call (03 §2.5) and an email that has left cannot be rolled back. A send
// that fails must therefore not fail the transition — a family whose connection moved and whose email bounced
// still has a moved connection, and the bounce is `comms`' own `email_logs` row to answer for (03 §8.4).
//
// 03 §8.1 as ADR-136 amends it: the caller passes an **id**, and `comms` resolves the address inside the send.
// So a party this module cannot NAME is a message not sent; a party it can name is sent to without this module
// ever holding an address. That is what closes `1g`'s pin — the nanny's `connection-requested` is sendable now,
// and `connections` is stricter than it was, not looser.
import type { Message } from "@/modules/comms";
import type { ConnectionRecord, ConnectionsDeps } from "../types";
import type { TransitionId } from "@/modules/shared-types";
import { messagesFor } from "./connection-messages";

export async function sendRowMessages(
  deps: ConnectionsDeps,
  id: TransitionId,
  record: ConnectionRecord,
): Promise<void> {
  const rows = messagesFor(id, record.fillInitiatedBy);
  if (rows.length === 0) return;

  const nanny = await deps.nannyFacts(record.nannyId);
  const nannyUserId = nanny.ok ? nanny.value?.userId : undefined;

  // ★ ADR-158 (2) / R-14 — "held rows withhold parent **notification** until L4". The hold is consulted HERE,
  // once, where the recipient set is built, which is the shape `visibleToParent` already uses on the read side:
  // a held row simply has no parent recipient, so every `to: "parent"` row drops through the `to === null` arm
  // that exists for an unresolvable address. Stage-blind on purpose, exactly as the read side is — the hold is
  // not about where the connection has got to but about whether this family may be told about this nanny at all
  // yet — so it covers all six parent-addressed templates of `MESSAGES_OF`, K-20's pair included. The nanny's
  // rows are untouched: the hold silences one audience, never the send. (REVIEW-4 H-2 / §8 R-5.)
  //
  // **Absent is not held**, matching `visibleToParent`: a record with no flag — every row written before `0024`,
  // and every double that does not model the pair — is not treated as held.
  const held = record.heldForVerification === true;

  // The parent's address still comes from the injected recipient port: her messages predate ADR-136 and the
  // mirror already carries a resolved address for `call-confirmation`. The **nanny** is named, never addressed.
  const parent =
    held || deps.recipientOf === undefined
      ? null
      : await deps.recipientOf(record.parentId);
  const parentTo = parent?.ok === true ? parent.value : null;

  const messages = rows.flatMap((row): ReadonlyArray<Message> => {
    const to =
      row.to === "parent"
        ? parentTo
        : nannyUserId === undefined
          ? null
          : {
              userId: nannyUserId,
              ...(nanny.ok && nanny.value?.firstName !== undefined
                ? { name: nanny.value.firstName }
                : {}),
            };
    if (to === null) return [];
    return [
      {
        channel: "email" as const,
        templateId: row.templateId,
        to,
        data: {},
        dedupeKey: `${id}:${record.connectionId as string}:${row.templateId}`,
      },
    ];
  });

  if (messages.length > 0) await deps.comms.sendMany(messages);
}
