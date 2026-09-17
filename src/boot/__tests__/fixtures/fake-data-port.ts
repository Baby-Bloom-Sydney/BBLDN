// A hand-driven `DataAccessPort` double (05 §4.3): the seam every boot adapter is written against, with no
// network and no driver type. Rows are whatever the test seeds, so they become the generated row type at the
// same single seam the real driver uses (`auth/lib/supabase-query.ts`) and for the same reason. One export.
import type { AppDatabase, DataAccessPort, DataScope } from "@/modules/auth";
import { err, fromThrown, ok } from "@/modules/platform";
import type {
  AppError,
  Query,
  UnitOfWork,
  QueryHandle,
  ReadableName,
  RowOf,
} from "@/modules/shared-types";

type Row = Readonly<Record<string, unknown>>;
export type FakeTables = Readonly<Record<string, ReadonlyArray<Row>>>;

export type FakeDataPort = {
  readonly port: DataAccessPort;
  readonly calls: ReadonlyArray<{
    readonly name: string;
    readonly scope: DataScope;
    readonly uow: UnitOfWork | undefined;
  }>;
  readonly inserted: ReadonlyArray<{
    readonly table: string;
    readonly row: Row;
  }>;
  /** set to make every `run` answer this error without reaching the query */
  readonly state: { failWith: AppError | undefined };
};

export function fakeDataPort(seed: FakeTables = {}): FakeDataPort {
  const calls: FakeDataPort["calls"][number][] = [];
  const inserted: FakeDataPort["inserted"][number][] = [];
  const state: FakeDataPort["state"] = { failWith: undefined };
  const asRow = <N extends ReadableName<AppDatabase>>(row: Row) =>
    row as RowOf<AppDatabase, N>;

  // ADR-129: `from()` is typed over tables **and** views; this double hands every name the table shape (a
  // fixture, not the driver — the select-only view handle is the drivers' rule, pinned in auth.views.test.ts).
  const query: Query<AppDatabase> = {
    from: <N extends ReadableName<AppDatabase>>(table: N) =>
      ({
        select: async () => (seed[table] ?? []).map(asRow<N>),
        insert: async (row: Row) => {
          inserted.push({ table, row });
          return asRow<N>(row);
        },
        update: async (_id: unknown, patch: Row) => asRow<N>(patch),
      }) as unknown as QueryHandle<AppDatabase, N>,
    rpc: async () => undefined as never,
  };

  const port: DataAccessPort = {
    run: async (op, opts) => {
      calls.push({
        name: op.name,
        scope: opts?.scope ?? "session",
        uow: opts?.uow,
      });
      if (state.failWith !== undefined)
        return { ok: false, error: state.failWith };
      try {
        return ok(await op.exec(query));
      } catch (thrown) {
        return fromThrown(thrown, { module: "auth", action: op.name });
      }
    },
    signUrl: async () =>
      err("INTERNAL", "signUrl is not exercised by these specs"),
  };

  return { port, calls, inserted, state };
}
