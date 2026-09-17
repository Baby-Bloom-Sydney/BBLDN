// The transaction opener stub (swap test 9's unit-of-work half; 05 §3 rule 1 — production code, no test import):
// an in-memory ledger of begun / committed / rolled-back transactions, immutable rows, optional failure switches.
import type { Result } from "@/modules/shared-types";
import type { MemoryTransaction, MemoryTransactionOpener } from "../types";
import { err } from "../../lib/err";
import { ok } from "../../lib/ok";

type Switches = { readonly failBegin?: boolean; readonly failCommit?: boolean };

export function memoryTransactionOpener(
  switches: Switches = {},
): MemoryTransactionOpener {
  const ledger = new Map<number, MemoryTransaction>();
  const counter = { next: 1 };

  const settle = (
    handle: MemoryTransaction,
    state: MemoryTransaction["state"],
  ): Result<void> => {
    const current = ledger.get(handle.id);
    if (current === undefined || current.state !== "open") {
      return err("INTERNAL", "Transaction is not open", {
        reason: "not-open",
        state: current?.state,
      });
    }
    ledger.set(handle.id, Object.freeze({ ...current, state }));
    return ok(undefined);
  };

  return Object.freeze({
    begin: async () => {
      if (switches.failBegin)
        return err("INTERNAL", "Could not begin", { reason: "begin-failed" });
      const transaction: MemoryTransaction = Object.freeze({
        id: counter.next,
        state: "open",
      });
      counter.next += 1;
      ledger.set(transaction.id, transaction);
      return ok(transaction);
    },
    commit: async (handle) =>
      switches.failCommit
        ? err("INTERNAL", "Could not commit", { reason: "commit-failed" })
        : settle(handle, "committed"),
    rollback: async (handle) => settle(handle, "rolled-back"),
    get transactions() {
      return Object.freeze([...ledger.values()]);
    },
  });
}
