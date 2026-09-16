// ADR-127 inside the data port: a `NamedOperation` run under `{ uow }` gets a `Query` that lets exactly one
// `rpc()` through — booked against the unit of work via the join, so a second is refused — and refuses every
// table **write** (`insert` / `update`): under PostgREST each of those is its own implicit transaction, so a
// write beside the RPC could never be atomic with it, and a seam that let it through would be lying about the
// atomicity the caller asked for. Reads pass: a `select` inside a unit of work is harmless. A refused call
// throws `UnitOfWorkRefusal`, which `DataAccessPort.run` turns back into the carried `Result`. Whether the token
// is one the binding holds open is the port's check, made before this guard is built.
import { err } from "@/modules/platform";
import type { UnitOfWorkJoin } from "@/modules/platform";
import type {
  Query,
  TableName,
  TableQuery,
  UnitOfWork,
} from "@/modules/shared-types";
import type { AppDatabase } from "../types";
import { UnitOfWorkRefusal } from "./unit-of-work-refusal";

const WRITE_OUTSIDE_RPC = "A write inside a unit of work is the RPC";

const refuseWrite = (): never => {
  throw new UnitOfWorkRefusal(
    err("INTERNAL", WRITE_OUTSIDE_RPC, { reason: "write-outside-rpc" }),
  );
};

function guardedTable<T extends TableName<AppDatabase>>(
  inner: TableQuery<AppDatabase, T>,
): TableQuery<AppDatabase, T> {
  return {
    select: (columns) => inner.select(columns),
    insert: async () => refuseWrite(),
    update: async () => refuseWrite(),
  };
}

/** The guarded surface for one open unit of work: one `rpc()`, reads, no table writes. */
export function guardUnitOfWorkQuery(
  query: Query<AppDatabase>,
  uow: UnitOfWork,
  join: UnitOfWorkJoin,
): Query<AppDatabase> {
  return {
    from: (table) => guardedTable(query.from(table)),
    rpc: async (name, args) => {
      const claimed = join.claimRpc(uow);
      if (!claimed.ok) throw new UnitOfWorkRefusal(claimed);
      return query.rpc(name, args);
    },
  };
}
