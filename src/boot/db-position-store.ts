// The `PositionStore` of `positions` (03 §2.5) over the real schema — `nanny_positions` + `position_schedule`
// (02 §4.2 rows 4 and 6; `0006`) — through `auth`'s data port.
//
// This is the file `1e` recorded as owed and `1g` pinned in `boot.test.ts`: `call-layer`, `connections` and
// `placements` are db stores, and while `positions` was `memoryPositionStore` the two halves disagreed about
// where a position lives — `advance(P-2)` wrote to memory and the call mirror P-2 cascades into looked in
// `nanny_positions`. With this store wired the disagreement is gone and the refusal in production goes with it.
//
// **Service scope throughout, named here and in `auth`'s README (07 §5.1 rule 5).** `0006` gives
// `nanny_positions` SELECT-only policies for every client role — "every write is `advance()` or `amend()`" — so
// the module that owns the table is the one writer, and it writes as the service role. The reads are service
// scope for the same reason `dbCallMirrorStore` gives: the P-row handlers run as `{ kind: 'system' }` inside a
// cascade and `matching.autofire` runs as a job, neither of which has a session to read under.
//
// **The `ParentId` / `UserId` seam is translated here and nowhere else.** `PositionRecord.parentId` is the
// parent's **user** id — that is what `create-positions-slice.ts`'s actor check compares a session against and
// what `getJourneySteps` is handed — while `nanny_positions.parent_id` references `parents.id`. One keyed read
// on `parents` each way, the same road `dbCallMirrorStore.findOpenForParent` takes.
//
// **The write is a table write, and that is pinned, not hidden.** ADR-127 makes one unit of work one RPC, and
// every position write runs inside the caller's unit of work — so under a real `uow` the port refuses these
// statements (`guard-unit-of-work-query.ts`, reason `write-outside-rpc`). `0006` / `0017` / `0018` define **no**
// `SECURITY DEFINER` function for `nanny_positions`, so there is nothing to call instead; the exact function a
// later `0019` owes is written down in `boot.test.ts` ("what 0019 owes") and measured there against the real
// wired port. The same gap sits under `1g`'s `db-connection-store.ts` and `db-placement-store.ts`. The `uow` is
// passed through rather than dropped, because dropping it would make this seam lie about atomicity.
import type { DataAccessPort } from "@/modules/auth";
import type { PositionRecord, PositionStore } from "@/modules/positions";
import { err, nowInstant, ok } from "@/modules/platform";
import type {
  Email,
  Instant,
  ParentId,
  PositionId,
  Result,
  UnitOfWork,
  Uuid,
} from "@/modules/shared-types";
import { positionRow } from "./position-row";
import { positionRecordFromRow } from "./position-record-from-row";
import type { PositionRowRead } from "./position-record-from-row";

/** 03 §2.2 / I-1 — the stages that count as a live position. */
const LIVE: ReadonlySet<string> = new Set([
  "DRAFT",
  "OPEN",
  "CONNECTING",
  "ACTIVE",
]);

type Recipient = { readonly email: Email; readonly name?: string };
type Party = { readonly userId: ParentId; readonly recipient: Recipient };
type ScheduleBlocks = Parameters<
  typeof positionRecordFromRow
>[0]["scheduleBlocks"];

const service = { scope: "service" as const };

export function dbPositionStore(
  port: DataAccessPort,
  clock: () => Instant = nowInstant,
): PositionStore {
  /**
   * The parent behind a position row, and the address that parent reads **today** — resolved on the way out,
   * never stored: `0006` gives the position no recipient column, and an address written at P-2 time goes stale
   * the moment the parent changes it. The same rule `dbCallMirrorStore` states for the mirror.
   */
  const partyOf = (parentRowId: string): Promise<Result<Party>> =>
    port.run(
      {
        name: "positions.readParty",
        exec: async (q) => {
          const parent = (await q
            .from("parents")
            .eq("id", parentRowId)
            .single()) as { readonly user_id: string } | null;
          if (parent === null)
            throw new Error(`positions: no parent row ${parentRowId}`);
          const profile = (await q
            .from("user_profiles")
            .eq("user_id", parent.user_id)
            .single()) as {
            readonly email: string | null;
            readonly first_name: string | null;
          } | null;
          return {
            userId: parent.user_id as string as ParentId,
            recipient: Object.freeze({
              email: (profile?.email ?? "") as Email,
              ...(profile?.first_name == null
                ? {}
                : { name: profile.first_name }),
            }),
          };
        },
      },
      service,
    );

  const parentRowIdOf = (parentId: ParentId): Promise<Result<string | null>> =>
    port.run(
      {
        name: "positions.readParentRowId",
        exec: async (q) =>
          (
            (await q
              .from("parents")
              .eq("user_id", parentId as string)
              .single()) as {
              readonly id: string;
            } | null
          )?.id ?? null,
      },
      service,
    );

  const blocksOf = (positionId: string): Promise<Result<ScheduleBlocks>> =>
    port.run(
      {
        name: "positions.readSchedule",
        exec: async (q) => {
          const row = (await q
            .from("position_schedule")
            .eq("position_id", positionId)
            .single()) as { readonly schedule: unknown } | null;
          return (row === null ? null : row.schedule) as ScheduleBlocks;
        },
      },
      service,
    );

  const hydrate = async (
    row: PositionRowRead,
  ): Promise<Result<PositionRecord>> => {
    const party = await partyOf(row.parent_id);
    if (!party.ok) return party;
    const blocks = await blocksOf(row.id);
    if (!blocks.ok) return blocks;
    return ok(
      positionRecordFromRow({
        row,
        parentUserId: party.value.userId,
        recipient: party.value.recipient,
        scheduleBlocks: blocks.value,
      }),
    );
  };

  const rowsFor = async (
    parentId: ParentId,
  ): Promise<Result<ReadonlyArray<PositionRowRead>>> => {
    const parentRowId = await parentRowIdOf(parentId);
    if (!parentRowId.ok) return parentRowId;
    if (parentRowId.value === null) return ok(Object.freeze([]));
    return port.run(
      {
        name: "positions.readForParent",
        exec: async (q) =>
          (await q
            .from("nanny_positions")
            .eq("parent_id", parentRowId.value as string)
            .select()) as ReadonlyArray<PositionRowRead>,
      },
      service,
    );
  };

  const hydrateAll = async (
    rows: ReadonlyArray<PositionRowRead>,
  ): Promise<Result<ReadonlyArray<PositionRecord>>> => {
    const records: PositionRecord[] = [];
    for (const row of rows) {
      const record = await hydrate(row);
      if (!record.ok) return record;
      records.push(record.value);
    }
    return ok(Object.freeze(records));
  };

  /** `position_schedule` is keyed on the position, so the roster is a delete-free upsert of one row. */
  const writeSchedule = async (
    record: PositionRecord,
    uow?: UnitOfWork,
  ): Promise<Result<void>> => {
    const schedule = record.detail.schedule;
    if (schedule === null) return ok(undefined);
    const existing = await blocksOf(record.positionId as string);
    if (!existing.ok) return existing;
    return port.run(
      {
        name: "positions.writeSchedule",
        exec: async (q) => {
          const patch = { schedule: [...schedule.blocks] };
          if (existing.value === null) {
            await q
              .from("position_schedule")
              .insert({ position_id: record.positionId as string, ...patch });
            return;
          }
          await q
            .from("position_schedule")
            .update(record.positionId as string as Uuid, patch);
        },
      },
      { ...service, ...(uow === undefined ? {} : { uow }) },
    );
  };

  return Object.freeze({
    get: async (positionId: PositionId) => {
      const row = await port.run(
        {
          name: "positions.get",
          exec: async (q) =>
            (await q
              .from("nanny_positions")
              .eq("id", positionId)
              .single()) as PositionRowRead | null,
        },
        service,
      );
      if (!row.ok) return row;
      return row.value === null ? ok(null) : hydrate(row.value);
    },

    liveForParent: async (parentId: ParentId) => {
      const rows = await rowsFor(parentId);
      if (!rows.ok) return rows;
      const live = rows.value.find((row) => LIVE.has(row.stage));
      return live === undefined ? ok(null) : hydrate(live);
    },

    listForParent: async (parentId: ParentId) => {
      const rows = await rowsFor(parentId);
      if (!rows.ok) return rows;
      return hydrateAll(rows.value);
    },

    put: async (record: PositionRecord, uow?: UnitOfWork) => {
      const parentRowId = await parentRowIdOf(record.parentId);
      if (!parentRowId.ok) return parentRowId;
      if (parentRowId.value === null)
        return err("NOT_FOUND", "No such parent", {
          reason: "E_ENTITY_NOT_FOUND",
        });
      const row = positionRow(record, parentRowId.value, clock());
      const written = await port.run(
        {
          name: "positions.put",
          exec: async (q) => {
            // `version: 1` is a create; `0006`'s `bump_version` trigger owns every later number, so the patch
            // deliberately carries none — a client-supplied version would race the trigger (1g's rule).
            if (record.version === 1) {
              await q.from("nanny_positions").insert(row);
              return;
            }
            const {
              id: _id,
              version: _version,
              created_at: _createdAt,
              ...patch
            } = row;
            await q
              .from("nanny_positions")
              .update(record.positionId as string as Uuid, patch);
          },
        },
        { ...service, ...(uow === undefined ? {} : { uow }) },
      );
      if (!written.ok) return written;
      return writeSchedule(record, uow);
    },
  });
}
