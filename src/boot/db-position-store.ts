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
// **The write is one RPC, which is what ADR-127 always said it would be.** P1-STORES wrote this store with a
// table write and pinned the consequence rather than hiding it: one unit of work is one RPC, so under a real
// `uow` the port refuses an `insert` / `update` on any table (`guard-unit-of-work-query.ts`, reason
// `write-outside-rpc`), and `0006` / `0017` / `0018` defined no `SECURITY DEFINER` function to call instead.
// `0019` is that function. `upsert_position()` writes `nanny_positions` **and** `position_schedule` in a single
// transaction — which it must, because the guard lets exactly one `rpc()` through per unit of work, so the
// roster could never have been a second statement. The `uow` is passed through rather than dropped, because
// dropping it would make this seam lie about atomicity.
import type { AppDatabase, DataAccessPort } from "@/modules/auth";
import type { PositionRecord, PositionStore } from "@/modules/positions";
import { err, nowInstant, ok } from "@/modules/platform";
import type {
  Email,
  Instant,
  ParentId,
  PositionId,
  PositionStage,
  Result,
  UnitOfWork,
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

/** `0019`'s generated argument shape, so the three `jsonb` seams are typed by the migration itself. */
type UpsertPositionArgs = AppDatabase["Functions"]["upsert_position"]["Args"];
type PositionJson = UpsertPositionArgs["p_columns"];

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

    // `4d` — the two scheduled sweeps' cohort. One stage, by the same single equality predicate as the reads
    // above; the set of stages a sweep acts on stays in the module, never as an `IN` list here.
    forStage: async (stage: PositionStage) => {
      const rows = await port.run(
        {
          name: "positions.forStage",
          exec: async (q) =>
            (await q
              .from("nanny_positions")
              .eq("stage", stage)
              .select()) as ReadonlyArray<PositionRowRead>,
        },
        service,
      );
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
      const schedule = record.detail.schedule;
      return port.run(
        {
          name: "positions.put",
          exec: async (q) => {
            // The whole row goes in as `p_columns`: `0019` strips the keys it takes as typed arguments
            // (`id` · `parent_id` · `source` · `stage` · `version` · `created_at` · `details`) and every
            // `call_*` key, so `upsert_call_mirror()` stays the one writer of the call's state and this
            // adapter does not have to keep a second copy of that list in step with the migration.
            // `p_expected_version` is the version this record was derived FROM: every slice computes
            // `existing.version + 1` (`create-positions-slice.ts`), so a create sends `0` and `0019`
            // reads `0` as "insert". A mismatch is refused, never overwritten (02 C-9).
            await q.rpc("upsert_position", {
              p_id: record.positionId as string,
              p_parent_id: parentRowId.value as string,
              p_source: record.source,
              p_stage: record.stage,
              p_columns: row as unknown as PositionJson,
              p_details: (row.details ?? null) as PositionJson,
              // A null roster is the absence of a `position_schedule` row (02 §4.2 row 6 — no row means
              // flexible, full marks), and `0019` leaves an existing one alone rather than deleting it:
              // `Query` has no delete and the module has never asked for one.
              p_schedule:
                schedule === null
                  ? null
                  : ([...schedule.blocks] as unknown as PositionJson),
              p_expected_version: record.version - 1,
            });
          },
        },
        { ...service, ...(uow === undefined ? {} : { uow }) },
      );
    },
  });
}
