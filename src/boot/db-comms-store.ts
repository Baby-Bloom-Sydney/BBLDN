// The `CommsStore` of `comms` (03 §8.1; 02 R-3 / R-10) over `auth`'s data port — the `email_logs` queue + log and
// the `inbox_messages` rows. **Service scope throughout, named in `auth`'s README** (07 §5.1 rule 5): `email_logs`
// carries an admin SELECT only and `inbox_messages` no client INSERT (`0011`), and comms writes every row (02 R-10).
// The keyed reads (`dedupe_key` · `id`) are ADR-131 (1)'s — what P1-WIRE could not honestly build. A `{ uow }` on
// `createInboxMessage` is passed through: under ADR-127 the port refuses a table write inside a unit of work, so
// the caller learns loudly that the row is the RPC's to write.
import type { DataAccessPort } from "@/modules/auth";
import type { CommsErrorDetails, CommsStore } from "@/modules/comms";
import { err, newId, nowInstant } from "@/modules/platform";
import type { Instant, MessageId, Result, Uuid } from "@/modules/shared-types";
import { emailLogInsertRow } from "./email-log-insert-row";
import { inboxInsertRow } from "./inbox-insert-row";
import { messageStateFromRow } from "./message-state-from-row";
import { settlePatch } from "./settle-patch";

/** 02 §4.6: a dedupe key is live while its row is `queued` or `sent` (the partial unique index's predicate). */
const LIVE = new Set<string>(["queued", "sent"]);
const CANCEL_REASON = "dedupe-key-cancelled";

const unknownMessage = (): Result<never, CommsErrorDetails> =>
  err<CommsErrorDetails>("NOT_FOUND", "That message could not be found.", {
    reason: "unknown-message",
  });

/** The port's `Result` carries `AppErrorDetails`; every method here promises `CommsErrorDetails`, a subtype. */
const asComms = <T>(result: Result<T>): Result<T, CommsErrorDetails> =>
  result as Result<T, CommsErrorDetails>;

export function dbCommsStore(
  port: DataAccessPort,
  clock: () => Instant = nowInstant,
): CommsStore {
  const service = { scope: "service" as const };
  return Object.freeze({
    findLiveByDedupeKey: async (dedupeKey) =>
      asComms(
        await port.run(
          {
            name: "comms.findLiveByDedupeKey",
            exec: async (q) =>
              ((
                await q
                  .from("email_logs")
                  .eq("dedupe_key", dedupeKey)
                  .select(["id", "status"])
              ).find((row) => LIVE.has(row.status))?.id as MessageId) ?? null,
          },
          service,
        ),
      ),
    record: async (input) =>
      asComms(
        await port.run(
          {
            name: "comms.record",
            exec: async (q) => {
              await q.from("email_logs").insert(emailLogInsertRow(input));
              return input.messageId;
            },
          },
          service,
        ),
      ),
    settle: async (messageId, state) =>
      asComms(
        await port.run(
          {
            name: "comms.settle",
            exec: async (q) => {
              // a MessageId is the `email_logs` row's uuid (02 §4.6 `id uuid`); the port's `update` keys on `Uuid`
              await q
                .from("email_logs")
                .update(
                  messageId as unknown as Uuid,
                  settlePatch(state, clock()),
                );
            },
          },
          service,
        ),
      ),
    read: async (messageId) => {
      const row = await port.run(
        {
          name: "comms.read",
          exec: (q) => q.from("email_logs").eq("id", messageId).single(),
        },
        service,
      );
      if (!row.ok) return asComms(row);
      return row.value === null
        ? unknownMessage()
        : { ok: true, value: messageStateFromRow(row.value) };
    },
    cancelByDedupeKey: async (dedupeKey) =>
      asComms(
        await port.run(
          {
            name: "comms.cancelByDedupeKey",
            exec: async (q) => {
              const queued = (
                await q
                  .from("email_logs")
                  .eq("dedupe_key", dedupeKey)
                  .select(["id", "status"])
              ).filter((row) => row.status === "queued");
              for (const row of queued)
                await q.from("email_logs").update(row.id as Uuid, {
                  status: "cancelled",
                  cancelled_reason: CANCEL_REASON,
                });
              return { cancelled: queued.length };
            },
          },
          service,
        ),
      ),
    createInboxMessage: async (msg, opts) =>
      asComms(
        await port.run(
          {
            name: "comms.createInboxMessage",
            exec: async (q) => {
              const id = newId<Uuid>();
              await q.from("inbox_messages").insert(inboxInsertRow(msg, id));
              return { id };
            },
          },
          { ...service, uow: opts?.uow },
        ),
      ),
  });
}
