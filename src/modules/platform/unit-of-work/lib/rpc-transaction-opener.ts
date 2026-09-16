// ADR-127 — the production opener. 03 §1.4's `Query` surface is `from()` + `rpc()` over PostgREST, which has no
// multi-statement client transaction, and S5 built the schema for exactly that: any write that must be atomic
// across tables is a `SECURITY DEFINER` function and **the function body is the transaction**. So `begin` mints
// a ledger row (no connection, no BEGIN), `claim` books the one RPC the unit of work may issue, and `commit` /
// `rollback` close the row — the function committed or rolled back at the RPC boundary, so neither touches the
// database. What this buys over "nothing": the opaque token is real (a foreign or settled one does not resolve),
// the "one RPC" rule is enforced rather than assumed, and a unit of work that never issued its RPC still settles.
// A pooled `pg` connection was rejected: it would bypass RLS and require `auth` to export a driver (01 §6.3).
import type { Result } from "@/modules/shared-types";
import type {
  RpcTransaction,
  RpcTransactionOpener,
  UnitOfWorkClaimDetails,
} from "../types";
import { err } from "../../lib/err";
import { ok } from "../../lib/ok";

const NOT_OPEN = "Unit of work is not open";

export function rpcTransactionOpener(): RpcTransactionOpener {
  // Bounded by construction, not by policy: the only caller of `begin` is `createUnitOfWork`'s `withUnitOfWork`,
  // whose `finally` always settles — so a row lives exactly as long as one unit of work. A caller that reached
  // `begin` any other way would leak rows here (security review, P1-WIRE LOW-1); the connector exposes no such path.
  const open = new Map<number, RpcTransaction>();
  const counter = { next: 1, committed: 0, rolledBack: 0 };

  const close = (
    handle: RpcTransaction,
    outcome: "committed" | "rolledBack",
  ): Result<void> => {
    if (!open.has(handle.id))
      return err("INTERNAL", NOT_OPEN, { reason: "unit-of-work-not-open" });
    open.delete(handle.id);
    counter[outcome] += 1;
    return ok(undefined);
  };

  const claim = (
    handle: RpcTransaction,
  ): Result<RpcTransaction, UnitOfWorkClaimDetails> => {
    const row = open.get(handle.id);
    if (row === undefined)
      return err("INTERNAL", NOT_OPEN, { reason: "unit-of-work-not-open" });
    if (row.rpcCount >= 1)
      return err("INTERNAL", "A unit of work is one RPC", {
        reason: "second-rpc-in-unit-of-work",
      });
    const next: RpcTransaction = Object.freeze({ ...row, rpcCount: 1 });
    open.set(handle.id, next);
    return ok(next);
  };

  return Object.freeze({
    begin: async () => {
      const row: RpcTransaction = Object.freeze({
        id: counter.next,
        rpcCount: 0,
      });
      counter.next += 1;
      open.set(row.id, row);
      return ok(row);
    },
    commit: async (handle) => close(handle, "committed"),
    rollback: async (handle) => close(handle, "rolledBack"),
    claim,
    get open() {
      return Object.freeze([...open.values()]);
    },
    get settled() {
      return Object.freeze({
        committed: counter.committed,
        rolledBack: counter.rolledBack,
      });
    },
  });
}
