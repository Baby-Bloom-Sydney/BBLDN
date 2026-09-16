// The `event-log` store over `auth`'s port (03 §9.5; 02 §4.6): the insert is a named service-role use that
// writes one `events` row shaped from the envelope, a `{ uow }` passes through to the port, and the two admin
// read helpers fail closed with their own reason (the Query surface has no predicate — recorded, not hidden).
import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@/modules/platform";
import type { UnitOfWork } from "@/modules/shared-types";
import { dbEventLogStore } from "../db-event-log-store";
import { fakeDataPort } from "./fixtures/fake-data-port";

const envelope = (
  over: Partial<EventEnvelope<"consent.updated">> = {},
): EventEnvelope =>
  ({
    id: "e1" as never,
    name: "consent.updated",
    ts: "2026-09-17T00:00:00.000Z" as never,
    source: "server",
    actor: { kind: "visitor", id: "v-1" as never },
    props: { marketing: true, necessary: true },
    requestId: "req-1",
    ...over,
  }) as EventEnvelope;

describe("dbEventLogStore.insert", () => {
  it("writes one events row under the service role, named for the audit line", async () => {
    const fake = fakeDataPort();
    const result = await dbEventLogStore(fake.port).insert(envelope());
    expect(result).toEqual({ ok: true, value: undefined });
    expect(fake.calls).toEqual([
      { name: "platform.events.insert", scope: "service", uow: undefined },
    ]);
    expect(fake.inserted).toEqual([
      {
        table: "events",
        row: {
          id: "e1",
          name: "consent.updated",
          ts: "2026-09-17T00:00:00.000Z",
          source: "server",
          actor_kind: "visitor",
          visitor_id: "v-1",
          subject_kind: null,
          subject_id: null,
          position_id: null,
          props: { marketing: true, necessary: true },
          attribution: null,
          request_id: "req-1",
          idempotency_key: null,
        },
      },
    ]);
  });

  it("maps each actor kind to its own columns — an admin on behalf carries on_behalf_of_id (07 §5.4 row 6)", async () => {
    const fake = fakeDataPort();
    const store = dbEventLogStore(fake.port);
    await store.insert(
      envelope({
        actor: {
          kind: "admin",
          id: "a-1" as never,
          onBehalfOf: { role: "parent", id: "u-9" as never },
        },
      }),
    );
    await store.insert(
      envelope({ actor: { kind: "system", id: "retention-sweep" } }),
    );
    await store.insert(envelope({ actor: { kind: "anonymous" } }));
    const rows = fake.inserted.map((i) => i.row);
    expect(rows[0]).toMatchObject({
      actor_kind: "admin",
      actor_id: "a-1",
      on_behalf_of_id: "u-9",
    });
    expect(rows[1]).toMatchObject({
      actor_kind: "system",
      system_job: "retention-sweep",
    });
    expect(rows[2]).toMatchObject({ actor_kind: "anonymous" });
    expect(rows[2]).not.toHaveProperty("actor_id");
  });

  it("passes the caller's unit of work through to the port, so ADR-127's rule is the port's to apply", async () => {
    const fake = fakeDataPort();
    const uow = {} as UnitOfWork;
    await dbEventLogStore(fake.port).insert(envelope(), { uow });
    expect(fake.calls[0]?.uow).toBe(uow);
  });

  it("returns the port's failure as a Result, never a throw", async () => {
    const fake = fakeDataPort();
    fake.state.failWith = { code: "INTERNAL", message: "down" };
    const result = await dbEventLogStore(fake.port).insert(envelope());
    expect(result.ok).toBe(false);
  });
});

describe("dbEventLogStore reads", () => {
  it("fail closed with their own reason rather than scanning the table", async () => {
    const fake = fakeDataPort({ events: [{ id: "x" }] });
    const store = dbEventLogStore(fake.port);
    const page = await store.query({});
    const counts = await store.countByName({
      names: ["visit"],
      from: "2026-01-01T00:00:00.000Z" as never,
      to: "2026-12-31T00:00:00.000Z" as never,
    });
    expect(!page.ok && page.error.details?.reason).toBe(
      "event-log-read-not-available",
    );
    expect(!counts.ok && counts.error.details?.reason).toBe(
      "event-log-read-not-available",
    );
    expect(fake.calls).toEqual([]);
  });
});
