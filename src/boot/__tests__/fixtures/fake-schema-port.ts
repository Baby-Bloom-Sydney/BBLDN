// A `DataAccessPort` double whose tables are **mutable**: an insert and an update are readable by the next read,
// so a store can be asserted round-trip ("what P-2 wrote is what `getForMatching` reads") rather than only on
// the statements it emitted. `fake-data-port.ts` stays as it is — its seeds are deliberately static, and every
// suite written against it asserts the calls, not the state. Two fixtures, two questions. One export.
import type { AppDatabase, DataAccessPort, DataScope } from "@/modules/auth";
import { err, fromThrown, ok } from "@/modules/platform";
import type {
  Query,
  QueryHandle,
  ReadableName,
  RowOf,
  UnitOfWork,
} from "@/modules/shared-types";

type Row = Record<string, unknown>;

/**
 * The keys `0019`'s `upsert_position()` strips from `p_columns` before it merges: each is either a typed
 * argument of its own, a trigger's to own, or — the `call_*` four — `upsert_call_mirror()`'s to write.
 */
const RESERVED = [
  "id",
  "parent_id",
  "source",
  "stage",
  "version",
  "created_at",
  "updated_at",
  "details",
  "call_state",
  "call_type",
  "call_requested_at",
  "call_booking_id",
] as const;

const without = (columns: Row): Row =>
  Object.fromEntries(
    Object.entries(columns).filter(
      ([key]) => !(RESERVED as ReadonlyArray<string>).includes(key),
    ),
  );

type UpsertPositionArgs = {
  readonly p_id: string;
  readonly p_parent_id: string;
  readonly p_source: string;
  readonly p_stage: string;
  readonly p_columns: Row;
  readonly p_details: unknown;
  readonly p_schedule: unknown;
  readonly p_expected_version: number;
};

export type FakeSchemaPort = {
  readonly port: DataAccessPort;
  readonly calls: ReadonlyArray<{
    readonly name: string;
    readonly scope: DataScope;
    readonly uow: UnitOfWork | undefined;
  }>;
  readonly rpcs: ReadonlyArray<{
    readonly name: string;
    readonly args: unknown;
  }>;
  /** the live rows of one table, as the double holds them */
  rows(table: string): ReadonlyArray<Readonly<Row>>;
};

export function fakeSchemaPort(
  seed: Readonly<Record<string, ReadonlyArray<Row>>> = {},
): FakeSchemaPort {
  const tables = new Map<string, Row[]>(
    Object.entries(seed).map(([name, rows]) => [
      name,
      rows.map((r) => ({ ...r })),
    ]),
  );
  const calls: FakeSchemaPort["calls"][number][] = [];
  const rpcs: FakeSchemaPort["rpcs"][number][] = [];
  const of = (table: string): Row[] => {
    const held = tables.get(table);
    if (held !== undefined) return held;
    const made: Row[] = [];
    tables.set(table, made);
    return made;
  };
  const asRow = <N extends ReadableName<AppDatabase>>(row: Row) =>
    ({ ...row }) as RowOf<AppDatabase, N>;

  const query: Query<AppDatabase> = {
    from: <N extends ReadableName<AppDatabase>>(table: N) =>
      ({
        select: async () => of(table).map(asRow<N>),
        insert: async (row: Row) => {
          of(table).push({ ...row });
          return asRow<N>(row);
        },
        update: async (id: unknown, patch: Row) => {
          const held = of(table).find((row) => row["id"] === id);
          if (held === undefined)
            throw new Error(`no ${table} row ${String(id)} to update`);
          Object.assign(held, patch);
          return asRow<N>(held);
        },
        eq: (column: string, value: unknown) => {
          const matching = () =>
            of(table).filter((row) => row[column] === value);
          return {
            select: async () => matching().map(asRow<N>),
            single: async () => {
              const rows = matching();
              if (rows.length > 1)
                throw new Error(
                  `keyed read matched ${String(rows.length)} rows`,
                );
              return rows.length === 0 ? null : asRow<N>(rows[0]);
            },
          };
        },
      }) as unknown as QueryHandle<AppDatabase, N>,
    // `0019`'s `upsert_position()`, stood in so the round-trip claims above stay claims about state rather
    // than about a call that returned `undefined`. It is a **stand-in, not a second implementation**: its
    // fidelity to the real function is proven by `int.rpc-0019` against the applied migration, never here.
    // Every other RPC is recorded and answers nothing, exactly as before.
    rpc: async (name, args) => {
      rpcs.push({ name, args });
      if (name !== "upsert_position") return undefined as never;
      return upsertPosition(args as unknown as UpsertPositionArgs) as never;
    },
  };

  const upsertPosition = (args: UpsertPositionArgs): number => {
    const patch = without(args.p_columns);
    const rows = of("nanny_positions");
    let version: number;
    if (args.p_expected_version === 0) {
      version = 1;
      rows.push({
        ...patch,
        id: args.p_id,
        parent_id: args.p_parent_id,
        source: args.p_source,
        stage: args.p_stage,
        version,
        created_at: args.p_columns["created_at"],
        details: args.p_details,
      });
    } else {
      const held = rows.find((row) => row["id"] === args.p_id);
      if (held === undefined) throw new Error("NOT_FOUND");
      if (held["version"] !== args.p_expected_version)
        throw new Error("VERSION_MISMATCH");
      // `0006`'s `bump_version` trigger owns every number after the first, so the double bumps too —
      // a double that left the number alone would make the store's compare-and-set untestable.
      version = (held["version"] as number) + 1;
      Object.assign(held, patch, {
        source: args.p_source,
        stage: args.p_stage,
        version,
        details: args.p_details ?? held["details"],
      });
    }
    if (args.p_schedule !== null && args.p_schedule !== undefined) {
      const roster = of("position_schedule");
      const held = roster.find((row) => row["position_id"] === args.p_id);
      if (held === undefined)
        roster.push({ position_id: args.p_id, schedule: args.p_schedule });
      else held["schedule"] = args.p_schedule;
    }
    return version;
  };

  const port: DataAccessPort = {
    run: async (op, opts) => {
      calls.push({
        name: op.name,
        scope: opts?.scope ?? "session",
        uow: opts?.uow,
      });
      try {
        return ok(await op.exec(query));
      } catch (thrown) {
        return fromThrown(thrown, { module: "auth", action: op.name });
      }
    },
    signUrl: async () =>
      err("INTERNAL", "signUrl is not exercised by these specs"),
  };

  return {
    port,
    calls,
    rpcs,
    rows: (table: string) => of(table).map((row) => ({ ...row })),
  };
}
