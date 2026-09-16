// The `EventLogStore` of `platform/events` (03 §9.5) over `auth`'s data port — the `event-log` sink writes the
// `events` table (02 §4.6; `0011`). `events` carries no client policy (07 §5.2), so the insert is a **named
// service-role use** (07 §5.1 rule 5 — listed in `auth`'s README) and every write leaves the port's audit line.
// A `{ uow }` is passed through: under ADR-127 the port refuses a table write inside a unit of work, so an emit
// that asks to join one fails the caller loudly — the atomic row is the stage RPC's to write (03 §2.5).
//
// The two admin read helpers fail closed: 03 §1.4's `Query` surface has no predicate and no aggregate, so
// `query` / `countByName` could only be a scan of the whole table. The admin reads are 02 §7's views and the
// helpers a later unit builds over them; this store says so rather than pretending.
import type { DataAccessPort } from "@/modules/auth";
import { err } from "@/modules/platform";
import type { EventLogStore } from "@/modules/platform";
import { eventInsertRow } from "./event-insert-row";

const READ_NOT_AVAILABLE = err(
  "INTERNAL",
  "Event reads are not available through this store",
  { reason: "event-log-read-not-available" },
);

export function dbEventLogStore(port: DataAccessPort): EventLogStore {
  return Object.freeze({
    insert: (envelope, opts) =>
      port.run(
        {
          name: "platform.events.insert",
          exec: async (q) => {
            await q.from("events").insert(eventInsertRow(envelope));
          },
        },
        { scope: "service", uow: opts?.uow },
      ),
    query: async () => READ_NOT_AVAILABLE,
    countByName: async () => READ_NOT_AVAILABLE,
  });
}
