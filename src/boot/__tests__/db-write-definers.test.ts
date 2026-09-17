// The write halves of `dbConnectionStore`, `dbPlacementStore`, `dbChildLinkingStore` and `dbSpineStore`,
// over `0019`'s definers.
//
// `1g` shipped both stores with a table `insert` / `update`, which ADR-127 refuses inside the caller's unit of
// work (`write-outside-rpc`) — the seam P1-STORES measured under all three stores and pinned in `boot.test.ts`.
// These are the claims this unit's merge rests on: the write is one RPC, it carries the compare-and-set the
// connector already computed, and the placeholders the read half invents never reach a column that cannot hold
// them. What the functions then DO with those arguments is `int.rpc-0019`'s claim, against the real database.
import { describe, expect, it } from "vitest";
import { dbConnectionStore } from "@/boot/db-connection-store";
import { dbPlacementStore } from "@/boot/db-placement-store";
import { dbChildLinkingStore } from "@/modules/app";
import { dbSpineStore } from "@/modules/payments";
import type { ConnectionRecord } from "@/modules/connections";
import type { PlacementRecord } from "@/modules/placements";
import type {
  ChildId,
  ConnectionId,
  FamilyId,
  Instant,
  InviteId,
  ISODate,
  Json,
  NannyId,
  ParentId,
  PlacementId,
  PositionId,
  Uuid,
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
  hourlyRatePence: 1500, // config-literal-ok: a fixture rate, asserted only as a round trip
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
        hourlyRatePence: 0, // config-literal-ok: the read half's placeholder for a NULL column
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
      hourly_rate_pence: 1500, // config-literal-ok: the same fixture rate, read back
      start_date: "2026-10-05",
    });
  });
});

// --------------------------------------------------------------------------- app/child-linking

const CHILD = "0e5f6071-0000-4000-8000-000000000006" as ChildId;
const MINTER = "5e551011-0000-4000-8000-00000000fe01";

describe("dbChildLinkingStore — the mint and the revoke are 0019's definers (07 §5.2)", () => {
  it("mints through create_child_invite under the caller's session, never a table insert", async () => {
    const fake = fakeSchemaPort();
    const made = await dbChildLinkingStore(fake.port).insertInvite({
      child_id: CHILD as string,
      token: "AB12-CD34",
      direction: "parent_to_nanny",
      created_by_user_id: MINTER,
    });

    expect(made.ok).toBe(true);
    expect(fake.rpcs.map((rpc) => rpc.name)).toEqual(["create_child_invite"]);
    expect(fake.rpcs[0]?.args).toEqual({
      p_child_id: CHILD,
      p_direction: "parent_to_nanny",
      p_token: "AB12-CD34",
    });
    // `auth.uid()` is the authority, so the call must carry a session — a service-scope call is refused by
    // the function itself (`INVITE_NO_SESSION`), which is what makes this a second gate and not a rename.
    expect(
      fake.calls.find((call) => call.name === "app.childLinking.insertInvite")
        ?.scope,
    ).toBe("session");
  });

  it("reads the minted invite back as state, with the creator the session stamped", async () => {
    const fake = fakeSchemaPort();
    const made = await dbChildLinkingStore(fake.port).insertInvite({
      child_id: CHILD as string,
      token: "AB12-CD34",
      direction: "parent_to_nanny",
      // deliberately somebody else: the function stamps `auth.uid()` and ignores this, which is the whole
      // reason the creator is a definer's business rather than a column the caller fills in.
      created_by_user_id: "0000ffff-0000-4000-8000-0000000000ff",
    });

    expect(made.ok && made.value.token).toBe("AB12-CD34");
    expect(made.ok && made.value.status).toBe("pending");
    expect(made.ok && made.value.created_by_user_id).toBe(MINTER);
    expect(fake.rows("child_invites")).toHaveLength(1);
  });

  it("is idempotent on the one pending invite per (child, direction) — the same row, not a second token", async () => {
    const fake = fakeSchemaPort();
    const store = dbChildLinkingStore(fake.port);
    const first = await store.insertInvite({
      child_id: CHILD as string,
      token: "AB12-CD34",
      direction: "parent_to_nanny",
      created_by_user_id: MINTER,
    });
    const again = await store.insertInvite({
      child_id: CHILD as string,
      token: "EF56-GH78",
      direction: "parent_to_nanny",
      created_by_user_id: MINTER,
    });

    expect(first.ok && again.ok && again.value.id).toBe(
      first.ok ? first.value.id : "different",
    );
    expect(again.ok && again.value.token).toBe("AB12-CD34");
    expect(fake.rows("child_invites")).toHaveLength(1);
  });

  it("revokes through revoke_child_invite under the caller's session, never a table update", async () => {
    const fake = fakeSchemaPort();
    const store = dbChildLinkingStore(fake.port);
    const made = await store.insertInvite({
      child_id: CHILD as string,
      token: "AB12-CD34",
      direction: "parent_to_nanny",
      created_by_user_id: MINTER,
    });
    const id = (made.ok ? made.value.id : "") as string as InviteId;
    const revoked = await store.updateInvite(id, {
      status: "revoked",
      revoked_at: "2026-09-17T10:00:00.000Z",
      revoked_reason: "manual",
    });

    expect(revoked.ok && revoked.value.status).toBe("revoked");
    expect(revoked.ok && revoked.value.revoked_reason).toBe("manual");
    expect(fake.rpcs.map((rpc) => rpc.name)).toEqual([
      "create_child_invite",
      "revoke_child_invite",
    ]);
    expect(fake.rpcs[1]?.args).toEqual({
      p_invite_id: id,
      p_reason: "manual",
    });
    expect(
      fake.calls.find((call) => call.name === "app.childLinking.updateInvite")
        ?.scope,
    ).toBe("session");
  });

  it("carries the terminal revoke back as the row that stands, never as a second revoke", async () => {
    const fake = fakeSchemaPort();
    const store = dbChildLinkingStore(fake.port);
    const made = await store.insertInvite({
      child_id: CHILD as string,
      token: "AB12-CD34",
      direction: "parent_to_nanny",
      created_by_user_id: MINTER,
    });
    const id = (made.ok ? made.value.id : "") as string as InviteId;
    await store.updateInvite(id, {
      status: "revoked",
      revoked_at: "2026-09-17T10:00:00.000Z",
      revoked_reason: "manual",
    });
    const again = await store.updateInvite(id, {
      status: "revoked",
      revoked_at: "2026-09-17T11:00:00.000Z",
      revoked_reason: "child_deleted",
    });

    // `revoke_child_invite` returns false and writes nothing; the store answers with the row as it stands,
    // reason and instant unchanged.
    expect(again.ok && again.value.revoked_reason).toBe("manual");
    expect(again.ok && again.value.revoked_at).toBe("2026-09-17T09:00:00.000Z");
  });

  it("refuses a patch that is not a revoke, because 0019 ships no other writer of child_invites", async () => {
    const fake = fakeSchemaPort();
    const patched = await dbChildLinkingStore(fake.port).updateInvite(
      "0e5f6071-0000-4000-8000-0000000000aa" as InviteId,
      { recipient_user_id: MINTER },
    );

    expect(patched.ok).toBe(false);
    // and it is refused for the stated reason, not because a table write happened to miss its row. The
    // reason rides as `cause` — 01 §4a keeps provider text out of the message.
    expect(
      !patched.ok && String((patched.error.cause as Error).message),
    ).toContain("revoke_child_invite");
    expect(fake.rpcs).toEqual([]);
    expect(fake.rows("child_invites")).toEqual([]);
  });

  it("inserts a child at SERVICE scope, because insert … returning is refused for every client role", async () => {
    // ★ `int.rpc-0019` measures the refusal: `children_access_select` reads `user_has_child_access(id)`, a
    // STABLE definer that queries `public.children`, so the row being inserted is invisible to it and the
    // RETURNING clause's SELECT check fails — for the child's own parent as much as for anybody else. The
    // insert is therefore the module's, at service scope, and the creator column travels with it rather
    // than being stamped from a session that is not there (`children_stamp_creator` keeps what a privileged
    // writer sends, by design).
    const fake = fakeSchemaPort();
    const written = await dbChildLinkingStore(fake.port).insertChild({
      parent_user_id: MINTER,
      first_name: "Ada",
      date_of_birth: "2025-01-04",
      created_by_user_id: MINTER,
    });

    expect(written.ok).toBe(true);
    expect(
      fake.calls.find((call) => call.name === "app.childLinking.insertChild")
        ?.scope,
    ).toBe("service");
    expect(fake.rows("children")[0]?.["created_by_user_id"]).toBe(MINTER);
  });
});

// --------------------------------------------------------------------------- payments

const FAMILY = "0f607182-0000-4000-8000-000000000007" as FamilyId;

describe("dbSpineStore — the webhook's three writes are apply_payment_event (ADR-127)", () => {
  const delivery = {
    provider: "stub-stripe",
    providerEventId: "evt_1",
    eventType: "purchase.completed",
    payload: { id: "evt_1" } as Json,
    receivedAt: NOW,
  };

  it("folds the ledger insert, the spine update and the stamp into one RPC", async () => {
    const fake = fakeSchemaPort();
    await dbSpineStore(fake.port).applyEvent({
      ...delivery,
      familyId: FAMILY,
      spinePatch: { status: "paid_in_full" },
      accessAgeYears: 3,
    });

    expect(fake.rpcs.map((rpc) => rpc.name)).toEqual(["apply_payment_event"]);
    expect(fake.rpcs[0]?.args).toEqual({
      p_provider: "stub-stripe",
      p_provider_event_id: "evt_1",
      p_event_type: "purchase.completed",
      p_payload: { id: "evt_1" },
      p_received_at: NOW,
      p_parent_user_id: FAMILY,
      p_spine_patch: { status: "paid_in_full" },
      p_access_age_years: 3,
    });
    expect(fake.rows("payment_events")).toEqual([]);
    expect(fake.rows("parent_subscriptions")).toEqual([]);
  });

  it("sends a null family and no patch for a delivery we cannot place, and runs at service scope", async () => {
    const fake = fakeSchemaPort();
    await dbSpineStore(fake.port).applyEvent({ ...delivery, familyId: null });

    // An omitted argument IS the null: `0019` gives the last three `default null`, the same seam
    // `upsert_placement`'s `p_connection_id` uses, and the generated `Args` type says so.
    const args = fake.rpcs[0]?.args as Record<string, unknown>;
    expect("p_parent_user_id" in args).toBe(false);
    expect("p_spine_patch" in args).toBe(false);
    expect("p_access_age_years" in args).toBe(false);
    expect(
      fake.calls.find((call) => call.name === "payments.applyEvent")?.scope,
    ).toBe("service");
  });

  it("reads 0019's jsonb answer as the outcome the spine turns on", async () => {
    const fake = fakeSchemaPort({}, {});
    const applied = await dbSpineStore(fake.port).applyEvent({
      ...delivery,
      familyId: FAMILY,
      spinePatch: { status: "paid_in_full" },
      accessAgeYears: 3,
    });
    // The double records the call and answers nothing, so the store must read a missing answer as an
    // outcome rather than crash on it: `int.rpc-0019` owns what the real function returns.
    expect(applied.ok).toBe(true);
  });
});
