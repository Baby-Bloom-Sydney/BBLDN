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
  QueryHandle,
  ReadableName,
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

/**
 * ADR-129: `from()` hands back a table handle or a view's select-only handle. A view has no write to refuse, so
 * its handle passes through with `select` alone; a table's `insert` / `update` are replaced by the refusal.
 * The `as` is the same conditional-type seam the two drivers carry (`QueryHandle` is conditional over the name).
 */
function guarded<N extends ReadableName<AppDatabase>>(
  inner: QueryHandle<AppDatabase, N>,
): QueryHandle<AppDatabase, N> {
  const handle = inner as {
    readonly select: (columns?: ReadonlyArray<string>) => Promise<unknown>;
    readonly insert?: unknown;
  };
  const select = (columns?: ReadonlyArray<string>) => handle.select(columns);
  if (handle.insert === undefined)
    return { select } as unknown as QueryHandle<AppDatabase, N>;
  return {
    select,
    insert: async () => refuseWrite(),
    update: async () => refuseWrite(),
  } as unknown as QueryHandle<AppDatabase, N>;
}

/** The guarded surface for one open unit of work: one `rpc()`, reads, no table writes. */
export function guardUnitOfWorkQuery(
  query: Query<AppDatabase>,
  uow: UnitOfWork,
  join: UnitOfWorkJoin,
): Query<AppDatabase> {
  return {
    from: (name) => guarded(query.from(name)),
    rpc: async (name, args) => {
      const claimed = join.claimRpc(uow);
      if (!claimed.ok) throw new UnitOfWorkRefusal(claimed);
      return query.rpc(name, args);
    },
  };
}
