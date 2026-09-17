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

  // The parent's address comes from the injected recipient port — the same one K-1's C-c cascade uses, so
  // there is one road to a person in this module and it is the profile's. The **nanny's** has none: 07 §5.2
  // keeps her address out of `nanny_public` and no document authorises a service-scope read of it, so her
  // messages are not sent and that is pinned as a failing test rather than papered over (see `1g`'s entry).
  const parent =
    deps.recipientOf === undefined
      ? null
      : await deps.recipientOf(record.parentId);
  const parentTo = parent?.ok === true ? parent.value : null;

  const messages = rows.flatMap((row): ReadonlyArray<Message> => {
    const to =
      row.to === "parent"
        ? parentTo
        : nannyEmail === undefined
          ? null
          : {
              email: nannyEmail,
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
