// The messages a K row sends (03 §8.3), sent **after** the write and never inside it.
//
// Why outside: `advance` is atomic per call (03 §2.5) and an email that has left cannot be rolled back. A send
// that fails must therefore not fail the transition — a family whose connection moved and whose email bounced
// still has a moved connection, and the bounce is `comms`' own `email_logs` row to answer for (03 §8.4).
//
// 03 §8.1: the caller passes fully resolved data, `comms` never looks a person up. So a party this module
// cannot resolve is a message **not sent**, recorded by its absence, rather than a guessed address.
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
  const nannyEmail = nanny.ok ? nanny.value?.email : undefined;

  const messages = rows.flatMap((row): ReadonlyArray<Message> => {
    // The parent's address has no road from here: `connections` may not import `auth` for a person lookup and
    // 03 §8.1 forbids `comms` doing it. Whoever wires the recipient port at boot closes this — recorded in the
    // `1g` PROGRESS entry, and pinned as a failing test rather than papered over with a placeholder.
    if (row.to === "parent") return [];
    if (nannyEmail === undefined) return [];
    return [
      {
        channel: "email" as const,
        templateId: row.templateId,
        to: {
          email: nannyEmail,
          ...(nanny.ok && nanny.value?.firstName !== undefined
            ? { name: nanny.value.firstName }
            : {}),
        },
        data: {},
        dedupeKey: `${id}:${record.connectionId as string}:${row.templateId}`,
      },
    ];
  });

  if (messages.length > 0) await deps.comms.sendMany(messages);
}
