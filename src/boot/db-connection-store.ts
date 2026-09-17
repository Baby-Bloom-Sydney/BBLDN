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
import type { DataAccessPort } from "@/modules/auth";
import type { ConnectionRecord, ConnectionStore } from "@/modules/connections";
import type {
  ConnectionId,
  NannyId,
  ParentId,
  PositionId,
  Result,
  UnitOfWork,
  Uuid,
} from "@/modules/shared-types";

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
});

export function dbConnectionStore(port: DataAccessPort): ConnectionStore {
  const list = (
    name: string,
    column: "position_id" | "parent_id",
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

  return Object.freeze({
    get: async (connectionId: ConnectionId) =>
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
      ),
    forPosition: (positionId: PositionId) =>
      list("forPosition", "position_id", positionId),
    forParent: (parentId: ParentId) => list("forParent", "parent_id", parentId),
    put: async (record: ConnectionRecord, uow?: UnitOfWork) =>
      port.run(
        {
          name: "connections.put",
          exec: async (q) => {
            // `version: 1` is a create; `0007`'s `bump_version` trigger owns every later number, so the patch
            // deliberately does not carry one — a client-supplied version would race the trigger.
            if (record.version === 1) {
              await q.from("connection_requests").insert({
                id: record.connectionId as string,
                ...patchOf(record),
              });
              return;
            }
            await q
              .from("connection_requests")
              .update(record.connectionId as string as Uuid, patchOf(record));
          },
        },
        { scope: "service", ...(uow === undefined ? {} : { uow }) },
      ),
  });
}
