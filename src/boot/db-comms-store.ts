// The `CommsStore` of `comms` (03 §8.1; 02 R-3 / R-10) over `auth`'s data port — the `email_logs` queue + log and
// the `inbox_messages` rows. **Service scope throughout, named in `auth`'s README** (07 §5.1 rule 5): `email_logs`
// carries an admin SELECT only and `inbox_messages` no client INSERT (`0011`), and comms writes every row (02 R-10).
// The keyed reads (`dedupe_key` · `id`) are ADR-131 (1)'s — what P1-WIRE could not honestly build. A `{ uow }` on
// `createInboxMessage` is passed through: under ADR-127 the port refuses a table write inside a unit of work, so
// the caller learns loudly that the row is the RPC's to write.
import type { DataAccessPort } from "@/modules/auth";
import type { CommsErrorDetails, CommsStore } from "@/modules/comms";
import { err, newId, nowInstant, ok } from "@/modules/platform";
import type {
  Email,
  Instant,
  MessageId,
  Result,
  Uuid,
} from "@/modules/shared-types";
import { adminNotificationInsertRow } from "./admin-notification-insert-row";
import { emailLogInsertRow } from "./email-log-insert-row";
import { inboxInsertRow } from "./inbox-insert-row";
import { messageStateFromRow } from "./message-state-from-row";
import { settlePatch } from "./settle-patch";

/** 02 §4.6: a dedupe key is live while its row is `queued` or `sent` (the partial unique index's predicate). */
const LIVE = new Set<string>(["queued", "sent"]);
const CANCEL_REASON = "dedupe-key-cancelled";

/**
 * ADR-136 — one refusal for every way a recipient fails to resolve. "No such user", "that user has no address"
 * and "that address is malformed" must read the same from outside, or a send becomes an enumeration oracle over
 * user ids (07 §4).
 */
const unresolvable = (): Result<never, CommsErrorDetails> =>
  err<CommsErrorDetails>("VALIDATION", "A valid email address is required", {
    reason: "invalid-recipient",
  });

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
    /**
     * ADR-136's read: `user_profiles` keyed on `user_id` (ADR-131 (1)), at service scope, in the store that
     * already writes `email_logs` under it. `user_profiles` carries no RLS route a business module could take
     * to the same column — and none is opened here: the address is answered **into a send** and the connector
     * never returns it.
     */
    resolveRecipient: async (userId) => {
      const row = await port.run(
        {
          name: "comms.resolveRecipient",
          exec: (q) =>
            q
              .from("user_profiles")
              .eq("user_id", userId as string)
              .single(),
        },
        service,
      );
      if (!row.ok) return asComms(row);
      const profile = row.value as {
        readonly email: string | null;
        readonly first_name: string | null;
      } | null;
      if (profile === null || profile.email === null) return unresolvable();
      return ok({
        email: profile.email as Email,
        userId,
        ...(profile.first_name === null ? {} : { name: profile.first_name }),
      });
    },
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
    /**
     * ★ M-13 (REVIEW-2). This discarded the update's result, so a patch matching **zero rows** was
     * indistinguishable from one that matched and the caller was told `ok`. A provider callback carrying a
     * message id we do not hold then reported success, and the send's real state was written nowhere.
     *
     * The row is read before it is patched rather than the write's answer being inspected, because the two
     * drivers behind this port disagree about what a zero-row `update` does — Supabase's `.select().single()`
     * raises, the memory driver appends — and a store must not depend on which one it is talking to.
     */
    settle: async (messageId, state) => {
      const matched = await port.run(
        {
          name: "comms.settle",
          exec: async (q) => {
            // a MessageId is the `email_logs` row's uuid (02 §4.6 `id uuid`); `update` keys on `Uuid`
            const id = messageId as unknown as Uuid;
            const found = await q.from("email_logs").eq("id", id).single();
            if (found === null) return false;
            await q.from("email_logs").update(id, settlePatch(state, clock()));
            return true;
          },
        },
        service,
      );
      if (!matched.ok) return asComms(matched);
      return matched.value ? ok(undefined) : unknownMessage();
    },
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
    // ADR-160: the one writer of `admin_notifications` (admin SELECT / UPDATE only — 0011), at service scope.
    // One OPEN row per (kind, subject) is `admin_notifications_one_open_per_subject_idx`: a repeat while the first
    // is unacknowledged is answered with the open row rather than duplicated (the seam's idempotency promise).
    //
    // **The index is what enforces that, not the read below.** The read-then-insert is a lookup, not a lock: two
    // concurrent calls for the same `(kind, subject)` — two roads barring the same nanny in the same second — can
    // both find nothing open before either insert lands. The loser's insert is then refused by the partial unique
    // index, `port.run` turns that into an error `Result`, and `notifyAdmin`'s caller warns and carries on (the
    // message the row accompanies is already sent). That is the intended outcome: the duplicate cannot exist, and
    // the operator's queue is never the reason a decision fails. Do not close the race by dropping the index — it
    // is the only guarantee — and do not promote its refusal into a failure of the decision.
    createAdminNotification: async (input) => {
      const id = newId<Uuid>();
      return asComms(
        await port.run<{ readonly id: Uuid }>(
          {
            name: "comms.createAdminNotification",
            exec: async (q) => {
              const open = await q
                .from("admin_notifications")
                .eq("kind", input.kind)
                .select();
              const existing = open.find(
                (row) =>
                  row.acknowledged_at === null &&
                  (row.subject_type ?? null) ===
                    (input.subject?.type ?? null) &&
                  (row.subject_id ?? null) === (input.subject?.id ?? null),
              );
              if (existing !== undefined) return { id: existing.id as Uuid };
              const inserted = await q
                .from("admin_notifications")
                .insert(adminNotificationInsertRow(input, id));
              return { id: (inserted.id ?? id) as Uuid };
            },
          },
          service,
        ),
      );
    },
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
