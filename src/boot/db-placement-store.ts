// The `PlacementStore` of `placements` over `nanny_placements` (`0007`), through `auth`'s data port.
//
// **Service scope, named here and in the module README (01 §6.3)**, for the same reason `connections`' store is:
// `0007` gives the table SELECT-only policies and no client write policy at all (07 §5.1 rule 4), and every
// write is made by an L row running inside a K-20 or a sweep — a cascade actor with no session.
//
// `0007`'s deferred constraint trigger `enforce_placement_position_active()` is the reason L-1 can be written
// in the same transaction as the P-5 that activates the position: it is checked at commit, not at insert.
import type { DataAccessPort } from "@/modules/auth";
import type { PlacementRecord, PlacementStore } from "@/modules/placements";
import type {
  ConnectionId,
  NannyId,
  ParentId,
  PlacementId,
  PositionId,
  Result,
  UnitOfWork,
  Uuid,
} from "@/modules/shared-types";

type Row = {
  readonly id: string;
  readonly position_id: string;
  readonly connection_id: string | null;
  readonly parent_id: string;
  readonly nanny_id: string;
  readonly source: string;
  readonly state: string;
  readonly weekly_hours: number | null;
  readonly hourly_rate_pence: number | null;
  readonly start_date: string | null;
  readonly started_at: string | null;
  readonly ended_at: string | null;
  readonly end_reason: string | null;
  readonly end_notes: string | null;
  readonly created_at: string;
  readonly version: number;
};

const recordOf = (row: Row): PlacementRecord =>
  Object.freeze({
    placementId: row.id as PlacementId,
    positionId: row.position_id as PositionId,
    connectionId: (row.connection_id ?? "") as ConnectionId,
    parentId: row.parent_id as ParentId,
    nannyId: row.nanny_id as NannyId,
    source: row.source as PlacementRecord["source"],
    state: row.state as PlacementRecord["state"],
    weeklyHours: row.weekly_hours ?? 0,
    hourlyRatePence: row.hourly_rate_pence ?? 0,
    startDate: (row.start_date ?? "") as PlacementRecord["startDate"],
    createdAt: row.created_at as PlacementRecord["createdAt"],
    version: row.version,
    ...(row.started_at === null
      ? {}
      : { startedAt: row.started_at as PlacementRecord["createdAt"] }),
    ...(row.ended_at === null
      ? {}
      : { endedAt: row.ended_at as PlacementRecord["createdAt"] }),
    ...(row.end_reason === null
      ? {}
      : { endReason: row.end_reason as PlacementRecord["endReason"] }),
    ...(row.end_notes === null ? {} : { endNotes: row.end_notes }),
  });

const patchOf = (record: PlacementRecord) => ({
  position_id: record.positionId as string,
  connection_id: record.connectionId as string,
  parent_id: record.parentId as string,
  nanny_id: record.nannyId as string,
  source: record.source,
  state: record.state,
  weekly_hours: record.weeklyHours,
  hourly_rate_pence: record.hourlyRatePence,
  start_date: record.startDate as string,
  ...(record.startedAt === undefined
    ? {}
    : { started_at: record.startedAt as string }),
  ...(record.endedAt === undefined
    ? {}
    : { ended_at: record.endedAt as string }),
  ...(record.endReason === undefined ? {} : { end_reason: record.endReason }),
  ...(record.endNotes === undefined ? {} : { end_notes: record.endNotes }),
});

export function dbPlacementStore(port: DataAccessPort): PlacementStore {
  const list = (
    name: string,
    column: "position_id" | "parent_id",
    value: string,
  ): Promise<Result<ReadonlyArray<PlacementRecord>>> =>
    port.run(
      {
        name: `placements.${name}`,
        exec: async (q) => {
          const rows = (await q
            .from("nanny_placements")
            .eq(column, value)
            .select()) as ReadonlyArray<Row>;
          return Object.freeze(rows.map(recordOf));
        },
      },
      { scope: "service" },
    );

  return Object.freeze({
    get: async (placementId: PlacementId) =>
      port.run(
        {
          name: "placements.get",
          exec: async (q) => {
            const row = (await q
              .from("nanny_placements")
              .eq("id", placementId)
              .single()) as Row | null;
            return row === null ? null : recordOf(row);
          },
        },
        { scope: "service" },
      ),
    forPosition: (positionId: PositionId) =>
      list("forPosition", "position_id", positionId),
    forParent: (parentId: ParentId) => list("forParent", "parent_id", parentId),
    put: async (record: PlacementRecord, uow?: UnitOfWork) =>
      port.run(
        {
          name: "placements.put",
          exec: async (q) => {
            // `version: 1` is a create; `0007`'s `bump_version` trigger owns every later number.
            if (record.version === 1) {
              await q.from("nanny_placements").insert({
                id: record.placementId as string,
                ...patchOf(record),
              });
              return;
            }
            await q
              .from("nanny_placements")
              .update(record.placementId as string as Uuid, patchOf(record));
          },
        },
        { scope: "service", ...(uow === undefined ? {} : { uow }) },
      ),
  });
}
