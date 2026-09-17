// The `EventLogStore` of `platform/events` (03 §9.5) over `auth`'s data port — the `event-log` sink writes the
// `events` table (02 §4.6; `0011`). `events` carries no client policy (07 §5.2), so every call here is a **named
// service-role use** (07 §5.1 rule 5 — listed in `auth`'s README) and leaves the port's audit line. A `{ uow }` on
// `insert` is passed through: under ADR-127 the port refuses a table write inside a unit of work, so an emit that
// asks to join one fails the caller loudly — the atomic row is the stage RPC's to write (03 §2.5).
//
// The reads (ADR-131 (1)): `query` is keyed on the position or on the subject's id — the two indexed access paths —
// with the rest of `EventsQuery` applied over the keyed rows in memory (the stub's semantics, `matches-events-
// query.ts`), ts ascending, paged by `limit` + an offset cursor. A query with **no key** is refused with its own
// reason: a whole-table scan under the service role is not a read model. `countByName` stays fail-closed for the
// same reason — an aggregate has no key and belongs to 02 §7's views / an RPC.
import type { DataAccessPort } from "@/modules/auth";
import { err, ok } from "@/modules/platform";
import type {
  EventLogStore,
  EventsPage,
  EventsQuery,
} from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import { eventEnvelopeFromRow } from "./event-envelope-from-row";
import { eventInsertRow } from "./event-insert-row";
import { eventsQueryKey } from "./events-query-key";
import { matchesEventsQuery } from "./matches-events-query";

const DEFAULT_LIMIT = 100;

const READ_REQUIRES_KEY = err(
  "INTERNAL",
  "Event reads need a position or a subject",
  { reason: "event-log-read-requires-key" },
);
const COUNT_NOT_AVAILABLE = err(
  "INTERNAL",
  "Event counts are not available through this store",
  { reason: "event-log-count-not-available" },
);

function pageOf(
  rows: ReadonlyArray<ReturnType<typeof eventEnvelopeFromRow>>,
  q: EventsQuery,
): EventsPage {
  const offset =
    q.cursor === undefined ? 0 : Number.parseInt(q.cursor, 10) || 0;
  const limit = q.limit ?? DEFAULT_LIMIT;
  const filtered = rows
    .filter((row) => matchesEventsQuery(row, q))
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const next = offset + limit;
  return {
    rows: filtered.slice(offset, next),
    ...(next < filtered.length ? { nextCursor: String(next) } : {}),
  };
}

export function dbEventLogStore(port: DataAccessPort): EventLogStore {
  const query = async (q: EventsQuery): Promise<Result<EventsPage>> => {
    const key = eventsQueryKey(q);
    if (key === null) return READ_REQUIRES_KEY;
    const rows = await port.run(
      {
        name: "platform.events.query",
        exec: (query) =>
          query.from("events").eq(key.column, key.value).select(),
      },
      { scope: "service" },
    );
    if (!rows.ok) return rows;
    return ok(pageOf(rows.value.map(eventEnvelopeFromRow), q));
  };

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
    query,
    countByName: async () => COUNT_NOT_AVAILABLE,
  });
}
