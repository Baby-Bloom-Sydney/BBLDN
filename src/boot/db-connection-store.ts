// The `ConnectionStore` of `connections` over `connection_requests` (`0007`), through `auth`'s data port.
//
// **Service scope, named here and in the module README (01 §6.3).** `0007` gives the table SELECT-only policies
// for both parties and no client write policy at all (07 §5.1 rule 4) — the module is the one writer, the way
// `events` is. The rows are also written by cascades running as `{ kind: 'system' }`, which have no session to
// read under.
//
// One equality predicate is all 03 §1.4's `Query` offers, which is exactly what each read needs: by id, by
// position, by parent. Nothing here filters by stage in SQL — `LIVE_STAGES` is the module's own definition and
// must not be restated as a `WHERE`.
//
// **The write is `upsert_connection()` (`0019`), not a table write.** ADR-127 makes one unit of work one RPC,
// and every K row runs inside the caller's unit of work, so the table `insert` / `update` this store shipped
// with was refused by the port (`write-outside-rpc`) the moment a real `uow` reached it — the gap P1-STORES
// measured under all three of these stores. The two 02 §4.2 row 7 uniques (one live connection per
// (position, nanny); one connection per position at OFFERED / CONFIRMED / ACTIVE) are raised **inside** the
// function by name, so a refusal reads as what it is rather than as a bare duplicate-key error.
import type { AppDatabase, DataAccessPort } from "@/modules/auth";
import type { ConnectionRecord, ConnectionStore } from "@/modules/connections";
import type {
  ConnectionId,
  ConnectionStage,
  NannyId,
  ParentId,
  PositionId,
  Result,
  UnitOfWork,
} from "@/modules/shared-types";

/** `0019`'s generated argument shape, so the `jsonb` seam is typed by the migration itself. */
type ConnectionJson =
  AppDatabase["Functions"]["upsert_connection"]["Args"]["p_columns"];

type Row = {
  readonly id: string;
  readonly position_id: string;
  readonly parent_id: string;
  readonly nanny_id: string;
  readonly stage: string;
  readonly origin: string;
  readonly created_at: string;
  readonly version: number;
  readonly expires_at: string | null;
  readonly meeting_at: string | null;
  readonly meeting_set_by: string | null;
  readonly meeting_outcome: string | null;
  readonly trial_date: string | null;
  readonly fill_initiated_by: string | null;
  readonly availability_slots: unknown;
  readonly held_for_verification: boolean | null;
  readonly held_at: string | null;
};

const slotCount = (slots: unknown): number | undefined =>
  Array.isArray(slots) ? slots.length : undefined;

const recordOf = (row: Row): ConnectionRecord =>
  Object.freeze({
    connectionId: row.id as ConnectionId,
    positionId: row.position_id as PositionId,
    parentId: row.parent_id as ParentId,
    nannyId: row.nanny_id as NannyId,
    stage: row.stage as ConnectionRecord["stage"],
    origin: row.origin as ConnectionRecord["origin"],
    createdAt: row.created_at as ConnectionRecord["createdAt"],
    version: row.version,
    ...(row.expires_at === null
      ? {}
      : { expiresAt: row.expires_at as ConnectionRecord["createdAt"] }),
    ...(row.meeting_at === null
      ? {}
      : { meetingAt: row.meeting_at as ConnectionRecord["createdAt"] }),
    ...(row.meeting_set_by === null
      ? {}
      : {
          meetingSetBy: row.meeting_set_by as ConnectionRecord["meetingSetBy"],
        }),
    ...(row.meeting_outcome === null
      ? {}
      : {
          meetingOutcome:
            row.meeting_outcome as ConnectionRecord["meetingOutcome"],
        }),
    ...(row.trial_date === null
      ? {}
      : { trialDate: row.trial_date as ConnectionRecord["trialDate"] }),
    ...(row.fill_initiated_by === null
      ? {}
      : {
          fillInitiatedBy:
            row.fill_initiated_by as ConnectionRecord["fillInitiatedBy"],
        }),
    ...(slotCount(row.availability_slots) === undefined
      ? {}
      : { availabilitySlots: slotCount(row.availability_slots) }),
    // ADR-158 (2) — the silent hold. Read back so a later K row rewrites what is already there rather than
    // clearing it; the release at L4 is `sync_nanny_verification_state()`'s and never this store's.
    heldForVerification: row.held_for_verification === true,
    ...(row.held_at === null
      ? {}
      : { heldAt: row.held_at as ConnectionRecord["createdAt"] }),
  });

const patchOf = (record: ConnectionRecord) => ({
  position_id: record.positionId as string,
  parent_id: record.parentId as string,
  nanny_id: record.nannyId as string,
  stage: record.stage,
  origin: record.origin,
  ...(record.expiresAt === undefined
    ? {}
    : { expires_at: record.expiresAt as string }),
  ...(record.meetingAt === undefined
    ? {}
    : { meeting_at: record.meetingAt as string }),
  ...(record.meetingSetBy === undefined
    ? {}
    : { meeting_set_by: record.meetingSetBy }),
  ...(record.meetingOutcome === undefined
    ? {}
    : { meeting_outcome: record.meetingOutcome }),
  ...(record.trialDate === undefined
    ? {}
    : { trial_date: record.trialDate as string }),
  ...(record.fillInitiatedBy === undefined
    ? {}
    : { fill_initiated_by: record.fillInitiatedBy }),
  // 02 §4.2 row 7 / R-14. `0024` is what makes these two reach the row: `0019`'s INSERT column list did not
  // carry them, which is what `2c` measured. The pair travels together because `0007`'s CHECK ties them.
  ...(record.heldForVerification === undefined
    ? {}
    : { held_for_verification: record.heldForVerification }),
  ...(record.heldAt === undefined ? {} : { held_at: record.heldAt as string }),
});

const listBy = (
  port: DataAccessPort,
  name: string,
  column: "position_id" | "parent_id" | "stage",
  value: string,
): Promise<Result<ReadonlyArray<ConnectionRecord>>> =>
  port.run(
    {
      name: `connections.${name}`,
      exec: async (q) => {
        const rows = (await q
          .from("connection_requests")
          .eq(column, value)
          .select()) as ReadonlyArray<Row>;
        return Object.freeze(rows.map(recordOf));
      },
    },
    { scope: "service" },
  );

const getById = (
  port: DataAccessPort,
  connectionId: ConnectionId,
): Promise<Result<ConnectionRecord | null>> =>
  port.run(
    {
      name: "connections.get",
      exec: async (q) => {
        const row = (await q
          .from("connection_requests")
          .eq("id", connectionId)
          .single()) as Row | null;
        return row === null ? null : recordOf(row);
      },
    },
    { scope: "service" },
  );

export function dbConnectionStore(port: DataAccessPort): ConnectionStore {
  return Object.freeze({
    get: (connectionId: ConnectionId) => getById(port, connectionId),
    forPosition: (positionId: PositionId) =>
      listBy(port, "forPosition", "position_id", positionId),
    forParent: (parentId: ParentId) =>
      listBy(port, "forParent", "parent_id", parentId),
    // `4d` — the sweeps' cohort. This is the one read that filters on `stage`, and it is still **one** stage
    // per call, by the same equality predicate as the other two: the header's rule stands, because the set of
    // stages a sweep acts on is `SWEPT_STAGES` in the module, never an `IN` list in this adapter.
    forStage: (stage: ConnectionStage) =>
      listBy(port, "forStage", "stage", stage),
    put: async (record: ConnectionRecord, uow?: UnitOfWork) =>
      port.run(
        {
          name: "connections.put",
          exec: async (q) => {
            // `patchOf` is handed in whole: `0019` strips the keys it takes as typed arguments
            // (`id` · `position_id` · `parent_id` · `nanny_id` · `stage` · `origin` · `version` ·
            // `created_at`), so this adapter keeps no second copy of that list. `p_expected_version`
            // is the version this record was derived FROM — a create sends `0`, which `0019` reads as
            // "insert"; `0007`'s `bump_version` trigger still owns every number after the first.
            await q.rpc("upsert_connection", {
              p_id: record.connectionId as string,
              p_position_id: record.positionId as string,
              p_parent_id: record.parentId as string,
              p_nanny_id: record.nannyId as string,
              p_stage: record.stage,
              p_origin: record.origin,
              p_columns: patchOf(record) as unknown as ConnectionJson,
              p_expected_version: record.version - 1,
            });
          },
        },
        { scope: "service", ...(uow === undefined ? {} : { uow }) },
      ),
  });
}
