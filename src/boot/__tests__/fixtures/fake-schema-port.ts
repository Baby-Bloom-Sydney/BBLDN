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
    rpc: async (name, args) => {
      rpcs.push({ name, args });
      return undefined as never;
    },
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
