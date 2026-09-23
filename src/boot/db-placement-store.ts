// The `PlacementStore` of `placements` over `nanny_placements` (`0007`), through `auth`'s data port.
//
// **Service scope, named here and in the module README (01 §6.3)**, for the same reason `connections`' store is:
// `0007` gives the table SELECT-only policies and no client write policy at all (07 §5.1 rule 4), and every
// write is made by an L row running inside a K-20 or a sweep — a cascade actor with no session.
//
// `0007`'s deferred constraint trigger `enforce_placement_position_active()` is the reason L-1 can be written
// in the same transaction as the P-5 that activates the position: it is checked at commit, not at insert — and
// it still is, because `upsert_placement()` (`0019`) returns before COMMIT and never pre-empts it.
//
// **The write is `upsert_placement()` (`0019`), not a table write** — ADR-127, the gap P1-STORES measured under
// all three of these stores. The two 02 §4.2 row 9 uniques (one non-ENDED placement per position, one per
// parent) are raised inside the function by name.
//
// **Three round-trip repairs, each forced by writing for real.** `recordOf` reads a missing connection, hours,
// rate and start date back as `""` / `0` / `""`, which was harmless while nothing wrote them and is not now:
// `""` is not a uuid or a date, and `0` fails `nanny_placements_weekly_hours_step_check` and
// `nanny_placements_hourly_rate_pence_check`. An `invite_shell` placement (02 §4.6) legitimately has all four
// absent, so the write maps each placeholder back to the NULL it came from rather than sending the placeholder
// to a column that cannot hold it.
import type { AppDatabase, DataAccessPort } from "@/modules/auth";
import type { PlacementRecord, PlacementStore } from "@/modules/placements";
import type {
  ConnectionId,
  NannyId,
  ParentId,
  PlacementId,
  PlacementState,
  PositionId,
  Result,
  UnitOfWork,
} from "@/modules/shared-types";

/** `0019`'s generated argument shape, so the `jsonb` seam is typed by the migration itself. */
type PlacementJson =
  AppDatabase["Functions"]["upsert_placement"]["Args"]["p_columns"];

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

/** The read's placeholders, mapped back to the NULLs they stand for — see the header. */
const patchOf = (record: PlacementRecord) => ({
  ...(record.weeklyHours === 0 ? {} : { weekly_hours: record.weeklyHours }),
  ...(record.hourlyRatePence === 0
    ? {}
    : { hourly_rate_pence: record.hourlyRatePence }),
  ...((record.startDate as string) === ""
    ? {}
    : { start_date: record.startDate as string }),
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
    column: "position_id" | "parent_id" | "state",
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
    // `4d` — `placement-start-sweep`'s cohort: one state, by the same single equality predicate as the other
    // two reads. The set of states a sweep acts on stays in the module, never as an `IN` list here.
    forState: (state: PlacementState) => list("forState", "state", state),
    put: async (record: PlacementRecord, uow?: UnitOfWork) =>
      port.run(
        {
          name: "placements.put",
          exec: async (q) => {
            const connectionId = record.connectionId as string;
            await q.rpc("upsert_placement", {
              p_id: record.placementId as string,
              p_position_id: record.positionId as string,
              p_parent_id: record.parentId as string,
              p_nanny_id: record.nannyId as string,
              p_source: record.source,
              p_state: record.state,
              p_columns: patchOf(record) as unknown as PlacementJson,
              // An omitted argument IS the null (`0019` gives it `default null` for exactly this):
              // an `invite_shell` placement has no connection, and `recordOf` reads that back as `""`.
              ...(connectionId === "" ? {} : { p_connection_id: connectionId }),
              // The version this record was derived FROM; a create sends `0`, which `0019` reads as
              // "insert". `0007`'s `bump_version` trigger still owns every number after the first.
              p_expected_version: record.version - 1,
            });
          },
        },
        { scope: "service", ...(uow === undefined ? {} : { uow }) },
      ),
  });
}
