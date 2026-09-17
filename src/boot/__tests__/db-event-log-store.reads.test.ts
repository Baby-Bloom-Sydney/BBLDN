// The `events` admin read helpers over `auth`'s port, live under ADR-131 (1) as far as a keyed read honestly
// reaches: `query` is keyed on `position_id` or on the subject's id (service scope — `events` has no client
// policy), the rest of `EventsQuery` (names · from · to · subject kind · limit · cursor) applied over the keyed
// rows in memory with the stub's semantics; a query with no key is refused with its own reason, because a scan
// of the whole table under the service role is not a read model. `countByName` stays fail-closed: an aggregate
// over the table has no key and belongs to a view / RPC (02 §7).
import { describe, expect, it } from "vitest";
import { dbEventLogStore } from "../db-event-log-store";
import { fakeDataPort } from "./fixtures/fake-data-port";

const POSITION = "33333333-3333-4333-8333-333333333333";
const eventRow = (over: Record<string, unknown>) => ({
  id: "e-1",
  name: "call.requested",
  ts: "2026-09-17T01:00:00.000Z",
  source: "server",
  actor_kind: "system",
  actor_id: null,
  on_behalf_of_id: null,
  system_job: "call-request",
  subject_kind: "position",
  subject_id: POSITION,
  position_id: POSITION,
  props: { callType: "matchmaking" },
  attribution: null,
  visitor_id: null,
  request_id: "req-1",
  idempotency_key: null,
  ...over,
});

describe("dbEventLogStore.query — keyed on the position", () => {
  it("reads the position's rows under the service role and answers them as envelopes, ts ascending", async () => {
    const fake = fakeDataPort({
      events: [
        eventRow({
          id: "e-2",
          ts: "2026-09-17T02:00:00.000Z",
          name: "call.slot-chosen",
          props: { slotAt: "2026-09-18T11:17:00.000Z" },
        }),
        eventRow({ id: "e-1" }),
      ],
    });
    const result = await dbEventLogStore(fake.port).query({
      positionId: POSITION as never,
    });
    expect(fake.calls).toEqual([
      { name: "platform.events.query", scope: "service", uow: undefined },
    ]);
    expect(fake.keyedReads).toEqual([
      { table: "events", column: "position_id", value: POSITION },
    ]);
    expect(result.ok && result.value.rows.map((r) => r.id)).toEqual([
      "e-1",
      "e-2",
    ]);
    expect(result.ok && result.value.rows[0]).toEqual({
      id: "e-1",
      name: "call.requested",
      ts: "2026-09-17T01:00:00.000Z",
      source: "server",
      actor: { kind: "system", id: "call-request" },
      subject: { kind: "position", id: POSITION },
      positionId: POSITION,
      props: { callType: "matchmaking" },
      requestId: "req-1",
    });
  });

  it("applies names, from / to and the page over the keyed rows", async () => {
    const fake = fakeDataPort({
      events: [
        eventRow({ id: "e-1", ts: "2026-09-17T01:00:00.000Z" }),
        eventRow({
          id: "e-2",
          ts: "2026-09-17T02:00:00.000Z",
          name: "call.slot-chosen",
        }),
        eventRow({ id: "e-3", ts: "2026-09-17T03:00:00.000Z" }),
        eventRow({ id: "e-4", ts: "2026-09-17T04:00:00.000Z" }),
      ],
    });
    const store = dbEventLogStore(fake.port);
    const named = await store.query({
      positionId: POSITION as never,
      names: ["call.requested"],
    });
    expect(named.ok && named.value.rows.map((r) => r.id)).toEqual([
      "e-1",
      "e-3",
      "e-4",
    ]);
    const window = await store.query({
      positionId: POSITION as never,
      from: "2026-09-17T02:00:00.000Z" as never,
      to: "2026-09-17T04:00:00.000Z" as never,
    });
    expect(window.ok && window.value.rows.map((r) => r.id)).toEqual([
      "e-2",
      "e-3",
    ]);
    const page1 = await store.query({
      positionId: POSITION as never,
      limit: 3,
    });
    expect(page1.ok && page1.value).toEqual({
      rows: expect.arrayContaining([expect.objectContaining({ id: "e-1" })]),
      nextCursor: "3",
    });
    const page2 = await store.query({
      positionId: POSITION as never,
      limit: 3,
      cursor: "3",
    });
    expect(page2.ok && page2.value.rows.map((r) => r.id)).toEqual(["e-4"]);
    expect(page2.ok && page2.value.nextCursor).toBeUndefined();
  });

  it("keys on the subject's id when no position is given, and still checks the subject kind", async () => {
    const fake = fakeDataPort({
      events: [
        eventRow({ id: "e-1", subject_kind: "booking", position_id: null }),
        eventRow({ id: "e-2", subject_kind: "position", position_id: null }),
      ],
    });
    const result = await dbEventLogStore(fake.port).query({
      subject: { kind: "booking", id: POSITION },
    });
    expect(fake.keyedReads).toEqual([
      { table: "events", column: "subject_id", value: POSITION },
    ]);
    expect(result.ok && result.value.rows.map((r) => r.id)).toEqual(["e-1"]);
  });

  it("refuses a query with no key — a whole-table scan under the service role is not a read model", async () => {
    const fake = fakeDataPort({ events: [eventRow({})] });
    const result = await dbEventLogStore(fake.port).query({
      names: ["call.requested"],
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "event-log-read-requires-key",
    );
    expect(fake.calls).toEqual([]);
  });

  it("maps every actor shape back: user, admin on behalf, visitor, anonymous", async () => {
    const fake = fakeDataPort({
      events: [
        eventRow({
          id: "u",
          actor_kind: "user",
          actor_id: "user-1",
          system_job: null,
        }),
        eventRow({
          id: "a",
          actor_kind: "admin",
          actor_id: "adm-1",
          on_behalf_of_id: "user-1",
          system_job: null,
        }),
        eventRow({
          id: "v",
          actor_kind: "visitor",
          visitor_id: "vis-1",
          system_job: null,
        }),
        eventRow({ id: "n", actor_kind: "anonymous", system_job: null }),
      ],
    });
    const result = await dbEventLogStore(fake.port).query({
      positionId: POSITION as never,
    });
    expect(result.ok && result.value.rows.map((r) => r.actor)).toEqual([
      { kind: "user", id: "user-1" },
      { kind: "admin", id: "adm-1", onBehalfOf: { id: "user-1" } },
      { kind: "visitor", id: "vis-1" },
      { kind: "anonymous" },
    ]);
  });
});

describe("dbEventLogStore.countByName", () => {
  it("still fails closed with its own reason — an aggregate has no key", async () => {
    const fake = fakeDataPort();
    const result = await dbEventLogStore(fake.port).countByName({
      names: ["call.requested"],
      from: "2026-09-17T00:00:00.000Z" as never,
      to: "2026-09-18T00:00:00.000Z" as never,
    });
    expect(!result.ok && result.error.details?.reason).toBe(
      "event-log-count-not-available",
    );
    expect(fake.calls).toEqual([]);
  });
});
