// platform/unit-of-work — the type surface of 03 §1.4's `withUnitOfWork` + the opaque `UnitOfWork` token
// (01 §6.3), the opener behind it, and the seam a data port joins it through. **ADR-127:** the transaction
// opener is the database function boundary — one RPC is one transaction — so the production opener is a
// ledger, never a connection, and the join is what lets `auth`'s port enforce the "one RPC" rule rather than
// assume it. Values live in index.ts.
import type {
  Result,
  UnitOfWork,
  WithUnitOfWork,
} from "@/modules/shared-types";

/**
 * `details.reason` of a refused join (03 §1.4 errors: `INTERNAL` — connection / commit):
 * `unit-of-work-unknown` — a token this binding did not mint, or one already settled;
 * `unit-of-work-not-open` — the opener no longer holds the handle open (settled between resolve and claim);
 * `second-rpc-in-unit-of-work` — ADR-127: the unit of work already issued its one RPC.
 */
export type UnitOfWorkClaimDetails = {
  readonly reason:
    | "unit-of-work-unknown"
    | "unit-of-work-not-open"
    | "second-rpc-in-unit-of-work";
};

/**
 * The port an opener implements: begin / commit / rollback on an opaque handle `H`. `platform` never sees a
 * driver type — it only carries `H` from `begin` to `commit` / `rollback` and hands it back to the owner
 * through `transactionOf` (see `UnitOfWorkBinding`).
 *
 * `claim` (ADR-127) books the one RPC a unit of work may issue and returns the handle as it now stands. An
 * opener that leaves it undefined places no limit — the memory opener is a real begin / commit / rollback
 * ledger and honours any number of operations; the RPC opener refuses a second.
 */
export type TransactionOpener<H> = {
  begin(): Promise<Result<H>>;
  commit(handle: H): Promise<Result<void>>;
  rollback(handle: H): Promise<Result<void>>;
  claim?(handle: H): Result<H, UnitOfWorkClaimDetails>;
};

/**
 * What a data port needs to honour `{ uow }` (03 §1.4 `DataAccessPort.run`) — and nothing more: whether the
 * token is one this binding minted and still holds open, and the booking of its one RPC. No handle type
 * crosses this seam, so `auth` can join without knowing what an opener holds (R4).
 */
export type UnitOfWorkJoin = {
  /** true iff `uow` was minted by this binding and has not settled */
  isOpen(uow: UnitOfWork): boolean;
  /** ADR-127: records the one RPC of `uow`; a second is refused, so one unit of work cannot straddle two transactions by accident */
  claimRpc(uow: UnitOfWork): Result<void, UnitOfWorkClaimDetails>;
};

/**
 * What `createUnitOfWork(opener)` returns: the `withUnitOfWork` of 03 §1.4 (commit on ok, roll back on error /
 * throw; nested calls join the outer), `transactionOf` — the one way the opener's owner gets its handle back for
 * a token a caller passed as `{ uow }`, typed by the same `H` it minted so no cast crosses a connector — and the
 * `join` a data port is handed at boot. `UnitOfWork` is one opaque type for every binding: a token another
 * binding minted resolves to `undefined` at run time (a WeakMap miss), not at compile time.
 */
export type UnitOfWorkBinding<H> = {
  readonly withUnitOfWork: WithUnitOfWork;
  readonly transactionOf: (uow: UnitOfWork) => H | undefined;
  /** The token of the unit of work the current async context is inside, if any (nested-call join). */
  readonly current: () => UnitOfWork | undefined;
  readonly join: UnitOfWorkJoin;
};

// ── The memory opener (the swap-test stub; 05 §3 rule 1) ──

export type MemoryTransactionState = "open" | "committed" | "rolled-back";
export type MemoryTransaction = {
  readonly id: number;
  readonly state: MemoryTransactionState;
};
export type MemoryTransactionOpener = TransactionOpener<MemoryTransaction> & {
  readonly transactions: ReadonlyArray<MemoryTransaction>;
};

// ── The RPC-boundary opener (ADR-127 — the production opener) ──

/** A ledger row, never a connection: the function that runs at the RPC boundary is the transaction. */
export type RpcTransaction = {
  readonly id: number;
  /** `0` until the unit of work's one RPC is claimed, then `1`; never more (ADR-127) */
  readonly rpcCount: number;
};

export type RpcTransactionOpener = TransactionOpener<RpcTransaction> & {
  claim(handle: RpcTransaction): Result<RpcTransaction, UnitOfWorkClaimDetails>;
  /** the units of work currently open — a settled one is dropped, so the ledger cannot grow with traffic */
  readonly open: ReadonlyArray<RpcTransaction>;
  /** how many units of work settled each way since the opener was created */
  readonly settled: {
    readonly committed: number;
    readonly rolledBack: number;
  };
};
