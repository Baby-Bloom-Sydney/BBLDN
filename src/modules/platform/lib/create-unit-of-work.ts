// 03 §1.4 `withUnitOfWork`: begin → run → commit on ok, roll back on error / throw; nested calls join the outer
// (AsyncLocalStorage carries the token down the async call tree); the token is opaque — the opener's handle is
// reachable only through the binding that minted it (`transactionOf`), so no driver type crosses a connector (R4).
import { AsyncLocalStorage } from "node:async_hooks";
import type { Result, UnitOfWork } from "@/modules/shared-types";
import type { TransactionOpener, UnitOfWorkBinding } from "../types";
import { err } from "./err";
import { fromThrown } from "./from-thrown";

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
      return await storage.run(token, async () =>
        settle(opener, begun.value, await runBody(fn, token)),
      );
    } finally {
      handles.delete(token);
    }
  };

  return Object.freeze({
    withUnitOfWork,
    transactionOf: (uow: UnitOfWork) => handles.get(uow),
    current: () => storage.getStore(),
  });
}
