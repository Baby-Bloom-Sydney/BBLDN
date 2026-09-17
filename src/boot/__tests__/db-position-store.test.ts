// `dbPositionStore` — the `PositionStore` of `positions` (03 §2.5) over `nanny_positions` + `position_schedule`
// (02 §4.2; `0006`). The claims this unit's merge rests on, as tests (ADR-120 rule 1):
//
//   1. the reads are keyed reads, at service scope, and the `ParentId` / `UserId` seam is translated here;
//   2. a record written by P-2 is read back by `getForMatching` and `findLive` — round trip, not statements;
//   3. a column is the source of truth for what it holds, and the `details` snapshot for what no column holds;
//
// The one write this store cannot make — a write inside a unit of work, which ADR-127 reserves for an RPC and
// `0006` / `0017` / `0018` give `nanny_positions` no definer for — is pinned where it can be MEASURED against
// the real wired port rather than a double: `boot.test.ts`, "what 0019 owes".
import { describe, expect, it } from "vitest";
import {
  configurePositions,
  createPositions,
  createPositionsSlice,
  registerPositionsSlice,
  registerSlice,
  advance,
  positions,
} from "@/modules/positions";
import {
  configureEvents,
  configureUnitOfWork,
  createEvents,
  createUnitOfWork,
  log,
  memoryEventLogStore,
  memoryTransactionOpener,
  ok,
} from "@/modules/platform";
import { LOCALE } from "@/modules/config";
import type {
  Actor,
  Email,
  Instant,
  ParentId,
  PositionId,
  StateAfter,
  TransitionId,
  UserId,
} from "@/modules/shared-types";
import { dbPositionStore } from "../db-position-store";
import { fakeSchemaPort } from "./fixtures/fake-schema-port";

const NOW = "2026-01-09T08:00:00.000Z" as Instant;
const POSITION = "0f1e2d3c-0000-4000-8000-0000000000d1" as PositionId;
const PARENT_USER = "0a1b2c3d-0000-4000-8000-0000000000e1" as UserId;
const PARENT_ROW = "0a1b2c3d-0000-4000-8000-0000000000e2";
const OWNER = PARENT_USER as unknown as ParentId;

const DETAIL = Object.freeze({
  area: { area: "Islington", district: "N1" },
  schedule: {
    type: "Fixed" as const,
    blocks: [{ day: 0 as const, part: "morning" as const }],
  },
  requirements: {
    childAgeMonths: [{ min: 12, max: 24 }],
    capacity: 1,
    specialNeeds: false,
    licence: false,
    car: true,
    vaccination: false,
    nonSmoker: true,
    pets: false,
    roleType: "sole-charge",
    languages: ["en"],
    nannyAge: { min: 21 },
  },
  minExperienceYears: 3,
  startDate: "2026-02-01T00:00:00.000Z" as Instant,
});

const seeded = () =>
  fakeSchemaPort({
    parents: [{ id: PARENT_ROW, user_id: PARENT_USER as string }],
    user_profiles: [
      {
        user_id: PARENT_USER as string,
        email: "ada@example.test",
        first_name: "Ada",
      },
    ],
  });

const record = (over: Record<string, unknown> = {}) =>
  ({
    positionId: POSITION,
    parentId: OWNER,
    source: "results_signup" as const,
    stage: "OPEN" as const,
    detail: DETAIL,
    recipient: { email: "ada@example.test" as Email, name: "Ada" },
    createdAt: NOW,
    precheck: null,
    version: 1,
    ...over,
  }) as Parameters<ReturnType<typeof dbPositionStore>["put"]>[0];

describe("dbPositionStore — the reads", () => {
  it("get is a keyed read on nanny_positions and hydrates the recipient from user_profiles, never from a column", async () => {
    const fake = seeded();
    const store = dbPositionStore(fake.port);
    await store.put(record());
    const found = await store.get(POSITION);
    expect(found.ok && found.value?.recipient).toEqual({
      email: "ada@example.test",
      name: "Ada",
    });
    // `0006` gives the position no recipient column, deliberately: an address written at P-2 time goes stale
    // the moment the parent changes it. Same rule `dbCallMirrorStore` states for the mirror.
    expect(Object.keys(fake.rows("nanny_positions")[0] ?? {})).not.toContain(
      "recipient_email",
    );
  });

  it("every read and write is service scope — the module owns the table's writes (07 §5.1 rule 4 / rule 5)", async () => {
    const fake = seeded();
    await dbPositionStore(fake.port).get(POSITION);
    expect(fake.calls.every((call) => call.scope === "service")).toBe(true);
  });

  it("translates the ParentId / UserId seam: the record carries the parent's user id, the row carries parents.id", async () => {
    const fake = seeded();
    await dbPositionStore(fake.port).put(record());
    expect(fake.rows("nanny_positions")[0]?.["parent_id"]).toBe(PARENT_ROW);
    const back = await dbPositionStore(fake.port).get(POSITION);
    expect(back.ok && back.value?.parentId).toBe(PARENT_USER);
  });

  it("liveForParent answers the one live position and ignores a closed one (I-1)", async () => {
    const fake = seeded();
    const store = dbPositionStore(fake.port);
    await store.put(
      record({ stage: "CLOSED", closeReason: "no_longer_needed" }),
    );
    const live = await store.liveForParent(OWNER);
    expect(live.ok && live.value).toBeNull();
    const all = await store.listForParent(OWNER);
    expect(all.ok && all.value).toHaveLength(1);
  });

  it("answers null for a position no row carries, rather than inventing one", async () => {
    const fake = seeded();
    const found = await dbPositionStore(fake.port).get(
      "0f1e2d3c-0000-4000-8000-0000000000ff" as PositionId,
    );
    expect(found).toEqual({ ok: true, value: null });
  });
});

describe("dbPositionStore — a column is the source of truth for what it holds", () => {
  it("writes the columns 0006 names and keeps the rest of the detail in the details snapshot", async () => {
    const fake = seeded();
    await dbPositionStore(fake.port).put(record());
    const row = fake.rows("nanny_positions")[0] as Record<string, unknown>;
    expect(row["district"]).toBe("N1");
    expect(row["area"]).toBe("Islington");
    expect(row["schedule_type"]).toBe("fixed");
    expect(row["car_required"]).toBe(true);
    expect(row["non_smoker_required"]).toBe(true);
    expect(row["years_experience_min"]).toBe(3);
    expect(row["minimum_nanny_age"]).toBe(21);
    expect(row["language_preference"]).toEqual(["en"]);
    expect(row["start_date"]).toBe("2026-02-01");
    expect(row["stage"]).toBe("OPEN");
  });

  it("the weekly roster is position_schedule's row, not a jsonb corner of the position", async () => {
    const fake = seeded();
    await dbPositionStore(fake.port).put(record());
    expect(fake.rows("position_schedule")[0]?.["schedule"]).toEqual([
      { day: 0, part: "morning" },
    ]);
  });

  it("a column edited outside this store wins over the snapshot on the way back", async () => {
    const fake = seeded();
    const store = dbPositionStore(fake.port);
    await store.put(record());
    const row = fake.rows("nanny_positions")[0] as Record<string, unknown>;
    await fake.port.run(
      {
        name: "positions.testEditDistrict",
        exec: async (q) =>
          q
            .from("nanny_positions")
            .update(row["id"] as never, { district: "E8" } as never),
      },
      { scope: "service" },
    );
    const back = await store.get(POSITION);
    expect(back.ok && back.value?.detail.area.district).toBe("E8");
  });

  it("carries the precheck lever on its three columns and reads it back whole", async () => {
    const fake = seeded();
    const store = dbPositionStore(fake.port);
    await store.put(
      record({
        precheck: { firedAt: NOW, expiresAt: NOW, wave: 1 },
        version: 1,
      }),
    );
    const row = fake.rows("nanny_positions")[0] as Record<string, unknown>;
    expect(row["precheck_wave_sent"]).toBe(1);
    const back = await store.get(POSITION);
    expect(back.ok && back.value?.precheck).toEqual({
      firedAt: NOW,
      expiresAt: NOW,
      wave: 1,
    });
  });

  it("a later version is an update, never a second insert — 0006's bump_version trigger owns the number", async () => {
    const fake = seeded();
    const store = dbPositionStore(fake.port);
    await store.put(record());
    await store.put(record({ stage: "CONNECTING", version: 2 }));
    expect(fake.rows("nanny_positions")).toHaveLength(1);
    expect(fake.rows("nanny_positions")[0]?.["stage"]).toBe("CONNECTING");
    // **2, not 1** — and the change is the double becoming faithful, not the claim moving. This test always
    // said the trigger owns the number; while the write was a table `update` the double did not bump, so the
    // stored value stayed at the one the insert wrote and the assertion recorded that artefact. `0019`'s
    // stand-in bumps the way `bump_version` does, so the number the store never sends now moves the way the
    // database moves it. The real claim lives in `int.rpc-0019` against the applied migration.
    expect(fake.rows("nanny_positions")[0]?.["version"]).toBe(2);
  });

  // ADR-127, and the claim this unit's merge rests on: the write is **one RPC**, carrying the compare-and-set
  // the connector already computed. A table statement here would be refused by the port under any real unit of
  // work (`write-outside-rpc`), which is precisely the seam P1-STORES measured and pinned.
  it("the write is upsert_position, and it sends the version the record was derived from", async () => {
    const fake = seeded();
    const store = dbPositionStore(fake.port);
    await store.put(record());
    await store.put(record({ stage: "CONNECTING", version: 2 }));

    expect(fake.rpcs.map((rpc) => rpc.name)).toEqual([
      "upsert_position",
      "upsert_position",
    ]);
    const args = fake.rpcs.map((rpc) => rpc.args as Record<string, unknown>);
    // a create sends 0, which `0019` reads as "insert"; the amend sends the version it read
    expect(args.map((a) => a["p_expected_version"])).toEqual([0, 1]);
    // the roster travels in the same call, because the guard allows exactly one RPC per unit of work
    expect(args[0]?.["p_schedule"]).toEqual([{ day: 0, part: "morning" }]);
    expect(args[0]?.["p_stage"]).toBe("OPEN");
  });

  // One writer per column: `upsert_call_mirror()` (0018) owns the call's state. `0019` strips the keys, and
  // this store must not be the thing that puts them back.
  it("never sends a call_* column of its own", async () => {
    const fake = seeded();
    await dbPositionStore(fake.port).put(record());
    const columns = (fake.rpcs[0]?.args as Record<string, unknown>)[
      "p_columns"
    ] as Record<string, unknown>;
    expect(
      Object.keys(columns).filter((key) => key.startsWith("call_")),
    ).toEqual([]);
  });
});

describe("dbPositionStore — the P-2 round trip", () => {
  const stageModel = (fake: ReturnType<typeof seeded>) => {
    configureEvents(createEvents({ store: memoryEventLogStore(), log }));
    configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
    const store = dbPositionStore(fake.port);
    configurePositions(createPositions({ store }));
    registerPositionsSlice(
      createPositionsSlice({ store, isInServiceArea: async () => true }),
    );
    registerSlice({
      entity: "call",
      handlers: (["C-a", "C-4"] as ReadonlyArray<TransitionId>).map((id) => ({
        id,
        run: async (): Promise<ReturnType<typeof ok<StateAfter>>> =>
          ok({
            entity: { kind: "call", id: POSITION },
            stage: "awaiting-slot",
            version: 1,
            changedAt: NOW,
            cascaded: [],
            events: [],
          } as StateAfter),
      })),
    });
    return store;
  };

  it("a position opened by P-2 is read back by getForMatching and findLive — the two halves agree", async () => {
    const fake = seeded();
    stageModel(fake);
    const actor: Actor = { kind: "system", id: "signup-convert-lead" };
    const moved = await advance({
      entity: { kind: "position", id: POSITION },
      transition: "P-2",
      actor,
      payload: {
        parentId: OWNER,
        source: "results_signup",
        detail: DETAIL,
        recipient: { email: "ada@example.test" as Email, name: "Ada" },
        mobile: `${LOCALE.phonePrefix}7700900123`,
      },
      expectedFrom: null,
      idempotencyKey: "p2-round-trip",
    });
    expect(moved.ok).toBe(true);

    const matching = await positions.getForMatching(POSITION);
    expect(matching.ok && matching.value.district).toBe("N1");
    expect(matching.ok && matching.value.parentId).toBe(PARENT_USER);

    const live = await positions.findLive(OWNER);
    expect(live.ok && live.value?.positionId).toBe(POSITION);
    expect(live.ok && live.value?.stage).toBe("OPEN");
  });
});
