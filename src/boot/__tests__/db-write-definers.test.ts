// The write halves of `dbConnectionStore` and `dbPlacementStore`, over `0019`'s definers.
//
// `1g` shipped both stores with a table `insert` / `update`, which ADR-127 refuses inside the caller's unit of
// work (`write-outside-rpc`) — the seam P1-STORES measured under all three stores and pinned in `boot.test.ts`.
// These are the claims this unit's merge rests on: the write is one RPC, it carries the compare-and-set the
// connector already computed, and the placeholders the read half invents never reach a column that cannot hold
// them. What the functions then DO with those arguments is `int.rpc-0019`'s claim, against the real database.
import { describe, expect, it } from "vitest";
import { dbConnectionStore } from "@/boot/db-connection-store";
import { dbPlacementStore } from "@/boot/db-placement-store";
import type { ConnectionRecord } from "@/modules/connections";
import type { PlacementRecord } from "@/modules/placements";
import type {
  ConnectionId,
  Instant,
  ISODate,
  NannyId,
  ParentId,
  PlacementId,
  PositionId,
} from "@/modules/shared-types";
import { fakeSchemaPort } from "./fixtures/fake-schema-port";

const POSITION = "0f1e2d3c-0000-4000-8000-000000000001" as PositionId;
const PARENT = "0a1b2c3d-0000-4000-8000-000000000002" as ParentId;
const NANNY = "0b2c3d4e-0000-4000-8000-000000000003" as NannyId;
const CONNECTION = "0c3d4e5f-0000-4000-8000-000000000004" as ConnectionId;
const PLACEMENT = "0d4e5f60-0000-4000-8000-000000000005" as PlacementId;
const NOW = "2026-09-17T09:00:00.000Z" as Instant;

const argsOf = (
  fake: ReturnType<typeof fakeSchemaPort>,
  index = 0,
): Record<string, unknown> => fake.rpcs[index]?.args as Record<string, unknown>;

const connection = (
  over: Partial<ConnectionRecord> = {},
): ConnectionRecord => ({
  connectionId: CONNECTION,
  positionId: POSITION,
  parentId: PARENT,
  nannyId: NANNY,
  stage: "REQUEST_SENT",
  origin: "nanny_application",
  createdAt: NOW,
  version: 1,
  ...over,
});

const placement = (over: Partial<PlacementRecord> = {}): PlacementRecord => ({
  placementId: PLACEMENT,
  positionId: POSITION,
  connectionId: CONNECTION,
  parentId: PARENT,
  nannyId: NANNY,
  source: "connection",
  state: "CONFIRMED",
  weeklyHours: 30,
  hourlyRatePence: 1500,
  startDate: "2026-10-05" as ISODate,
  createdAt: NOW,
  version: 1,
  ...over,
});

describe("dbConnectionStore — the write is upsert_connection (ADR-127)", () => {
  it("creates through the RPC with p_expected_version 0, and amends with the version it read", async () => {
    const fake = fakeSchemaPort();
    const store = dbConnectionStore(fake.port);
    await store.put(connection());
    await store.put(
      connection({ stage: "ACCEPTED", version: 2, expiresAt: NOW }),
    );

    expect(fake.rpcs.map((rpc) => rpc.name)).toEqual([
      "upsert_connection",
      "upsert_connection",
    ]);
    expect(argsOf(fake, 0)["p_expected_version"]).toBe(0);
    expect(argsOf(fake, 1)["p_expected_version"]).toBe(1);
    expect(argsOf(fake, 1)["p_stage"]).toBe("ACCEPTED");
    expect(argsOf(fake, 0)["p_origin"]).toBe("nanny_application");
  });

  it("emits no table statement of its own, so a unit of work can be atomic", async () => {
    const fake = fakeSchemaPort();
    await dbConnectionStore(fake.port).put(connection());
    expect(fake.rows("connection_requests")).toEqual([]);
    expect(fake.rpcs).toHaveLength(1);
  });

  it("passes the parent id as an argument, because 0007 denormalised it and it must not go stale", async () => {
    const fake = fakeSchemaPort();
    await dbConnectionStore(fake.port).put(connection());
    expect(argsOf(fake)["p_parent_id"]).toBe(PARENT);
    expect(argsOf(fake)["p_position_id"]).toBe(POSITION);
    expect(argsOf(fake)["p_nanny_id"]).toBe(NANNY);
  });
});

describe("dbPlacementStore — the write is upsert_placement (ADR-127)", () => {
  it("creates through the RPC with p_expected_version 0, and amends with the version it read", async () => {
    const fake = fakeSchemaPort();
    const store = dbPlacementStore(fake.port);
    await store.put(placement());
    await store.put(placement({ state: "ACTIVE", version: 2, startedAt: NOW }));

    expect(fake.rpcs.map((rpc) => rpc.name)).toEqual([
      "upsert_placement",
      "upsert_placement",
    ]);
    expect(argsOf(fake, 0)["p_expected_version"]).toBe(0);
    expect(argsOf(fake, 1)["p_expected_version"]).toBe(1);
    expect(argsOf(fake, 1)["p_state"]).toBe("ACTIVE");
    expect(
      (argsOf(fake, 1)["p_columns"] as Record<string, unknown>)["started_at"],
    ).toBe(NOW);
  });

  it("emits no table statement of its own", async () => {
    const fake = fakeSchemaPort();
    await dbPlacementStore(fake.port).put(placement());
    expect(fake.rows("nanny_placements")).toEqual([]);
  });

  // The three round-trip repairs. `recordOf` reads a missing connection / hours / rate / start date back as
  // `""` / `0` / `""` — harmless while nothing wrote them, and not now: `""` is not a uuid or a date, and `0`
  // fails `nanny_placements_weekly_hours_step_check` and `nanny_placements_hourly_rate_pence_check`. An
  // `invite_shell` placement (02 §4.6) legitimately has all four absent.
  it("omits the connection argument for an invite_shell placement rather than sending an empty string", async () => {
    const fake = fakeSchemaPort();
    await dbPlacementStore(fake.port).put(
      placement({
        source: "invite_shell",
        connectionId: "" as ConnectionId,
        weeklyHours: 0,
        hourlyRatePence: 0,
        startDate: "" as ISODate,
      }),
    );
    const args = argsOf(fake);
    expect("p_connection_id" in args).toBe(false);
    const columns = args["p_columns"] as Record<string, unknown>;
    expect("weekly_hours" in columns).toBe(false);
    expect("hourly_rate_pence" in columns).toBe(false);
    expect("start_date" in columns).toBe(false);
  });

  it("still sends real terms when there are real terms", async () => {
    const fake = fakeSchemaPort();
    await dbPlacementStore(fake.port).put(placement());
    const args = argsOf(fake);
    expect(args["p_connection_id"]).toBe(CONNECTION);
    expect(args["p_columns"]).toMatchObject({
      weekly_hours: 30,
      hourly_rate_pence: 1500,
      start_date: "2026-10-05",
    });
  });
});
