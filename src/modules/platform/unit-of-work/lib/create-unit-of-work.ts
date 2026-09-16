// 03 §1.4 `withUnitOfWork`: begin → run → commit on ok, roll back on error / throw; nested calls join the outer
// (AsyncLocalStorage carries the token down the async call tree); the token is opaque — the opener's handle is
// reachable only through the binding that minted it (`transactionOf`), so no driver type crosses a connector (R4).
// The `join` is the seam a data port is handed at boot (ADR-127): it resolves a token to "mine and open" and books
// the unit of work's one RPC through the opener's `claim`, keeping the handle current as it does.
import { AsyncLocalStorage } from "node:async_hooks";
import type { Result, UnitOfWork } from "@/modules/shared-types";
import type {
  TransactionOpener,
  UnitOfWorkBinding,
  UnitOfWorkClaimDetails,
  UnitOfWorkJoin,
} from "../types";
import { err } from "../../lib/err";
import { fromThrown } from "../../lib/from-thrown";
import { ok } from "../../lib/ok";

type Body<T> = (uow: UnitOfWork) => Promise<Result<T>>;

/** The brand symbol is `declare`d (no runtime), so minting is a cast — here and nowhere else. */
const mintToken = (): UnitOfWork => Object.freeze({}) as UnitOfWork;

async function runBody<T>(fn: Body<T>, uow: UnitOfWork): Promise<Result<T>> {
  try {
    return await fn(uow);
  } catch (thrown) {
    return fromThrown(thrown, { module: "platform", action: "withUnitOfWork" });
  }
}

async function settle<H, T>(
  opener: TransactionOpener<H>,
  handle: H,
  outcome: Result<T>,
): Promise<Result<T>> {
  if (!outcome.ok) {
    const rolledBack = await opener.rollback(handle);
    return rolledBack.ok
      ? outcome
      : err(
          "INTERNAL",
          "Rollback failed",
          { reason: "rollback-failed", originalCode: outcome.error.code },
          rolledBack.error,
        );
  }
  const committed = await opener.commit(handle);
  if (committed.ok) return outcome;
  await opener.rollback(handle);
  return err(
    "INTERNAL",
    "Commit failed",
    { reason: "commit-failed" },
    committed.error,
  );
}

function joinOver<H>(
  opener: TransactionOpener<H>,
  handles: WeakMap<UnitOfWork, H>,
): UnitOfWorkJoin {
  const claimRpc = (uow: UnitOfWork): Result<void, UnitOfWorkClaimDetails> => {
    const handle = handles.get(uow);
    if (handle === undefined)
      return err("INTERNAL", "Unit of work is not open", {
        reason: "unit-of-work-unknown",
      });
    if (opener.claim === undefined) return ok(undefined);
    const claimed = opener.claim(handle);
    if (!claimed.ok) return claimed;
    handles.set(uow, claimed.value);
    return ok(undefined);
  };
  return Object.freeze({ isOpen: (uow) => handles.has(uow), claimRpc });
}

export function createUnitOfWork<H>(
  opener: TransactionOpener<H>,
): UnitOfWorkBinding<H> {
  const storage = new AsyncLocalStorage<UnitOfWork>();
  const handles = new WeakMap<UnitOfWork, H>();

  const withUnitOfWork = async <T>(fn: Body<T>): Promise<Result<T>> => {
    const outer = storage.getStore();
    if (outer !== undefined) return runBody(fn, outer);
    const begun = await opener.begin();
    if (!begun.ok) return begun;
    const token = mintToken();
    handles.set(token, begun.value);
    try {
      const outcome = await storage.run(token, () => runBody(fn, token));
      // `claim` may have replaced the handle since `begin`; settle the one the ledger holds now.
      return await settle(opener, handles.get(token) ?? begun.value, outcome);
    } finally {
      handles.delete(token);
    }
  };

  return Object.freeze({
    withUnitOfWork,
    transactionOf: (uow: UnitOfWork) => handles.get(uow),
    current: () => storage.getStore(),
    join: joinOver(opener, handles),
  });
}
