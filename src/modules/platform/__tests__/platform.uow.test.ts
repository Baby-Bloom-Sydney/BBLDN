// withUnitOfWork (01 §6.3; 03 §1.4): commit on ok, roll back on error / throw, nested calls join the outer,
// the opaque token resolves to the opener's handle only through the binding that minted it; the module-level
// default fails closed until the boot code configures a binding. Swap test 9's unit-of-work half runs over both
// openers: the memory opener (the stub) and the RPC-boundary opener (ADR-127 — the production one).
import { describe, expect, it } from "vitest";
import {
  configureUnitOfWork,
  createUnitOfWork,
  currentUnitOfWork,
  err,
  memoryTransactionOpener,
  ok,
  rpcTransactionOpener,
  unitOfWorkJoin,
  withUnitOfWork,
} from "@/modules/platform";
import type { UnitOfWork } from "@/modules/shared-types";

describe("platform — createUnitOfWork over the memory opener (swap test 9's uow half)", () => {
  it("commits when the callback returns ok and hands the handle back through transactionOf", async () => {
    const opener = memoryTransactionOpener();
    const binding = createUnitOfWork(opener);
    const result = await binding.withUnitOfWork(async (uow) => {
      expect(binding.transactionOf(uow)?.state).toBe("open");
      expect(binding.current()).toBe(uow);
      return ok("done");
    });
    expect(result).toEqual({ ok: true, value: "done" });
    expect(opener.transactions.map((t) => t.state)).toEqual(["committed"]);
    expect(binding.current()).toBeUndefined();
  });

  it("rolls back when the callback returns an error and returns that error", async () => {
    const opener = memoryTransactionOpener();
    const binding = createUnitOfWork(opener);
    const result = await binding.withUnitOfWork(async () =>
      err("CONFLICT", "no", { reason: "stage" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
    expect(opener.transactions.map((t) => t.state)).toEqual(["rolled-back"]);
  });

  it("rolls back on a throw and returns INTERNAL with the throw as cause", async () => {
    const opener = memoryTransactionOpener();
    const binding = createUnitOfWork(opener);
    const boom = new Error("boom");
    const result = await binding.withUnitOfWork(async () => {
      throw boom;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.cause).toBe(boom);
    }
    expect(opener.transactions.map((t) => t.state)).toEqual(["rolled-back"]);
  });

  it("nested calls join the outer unit of work — one transaction, one commit", async () => {
    const opener = memoryTransactionOpener();
    const binding = createUnitOfWork(opener);
    const result = await binding.withUnitOfWork(async (outer) =>
      binding.withUnitOfWork(async (inner) => {
        expect(inner).toBe(outer);
        return ok(1);
      }),
    );
    expect(result).toEqual({ ok: true, value: 1 });
    expect(opener.transactions).toHaveLength(1);
    expect(opener.transactions[0]?.state).toBe("committed");
  });

  it("an inner error rolls the whole unit of work back", async () => {
    const opener = memoryTransactionOpener();
    const binding = createUnitOfWork(opener);
    const result = await binding.withUnitOfWork(async () => {
      const inner = await binding.withUnitOfWork(async () =>
        err("NOT_FOUND", "x"),
      );
      return inner.ok ? ok("unreachable") : inner;
    });
    expect(result.ok).toBe(false);
    expect(opener.transactions.map((t) => t.state)).toEqual(["rolled-back"]);
  });

  it("surfaces a failed begin, and a failed commit as INTERNAL", async () => {
    const noBegin = createUnitOfWork(
      memoryTransactionOpener({ failBegin: true }),
    );
    const began = await noBegin.withUnitOfWork(async () => ok(1));
    expect(began.ok).toBe(false);
    if (!began.ok) expect(began.error.code).toBe("INTERNAL");

    const opener = memoryTransactionOpener({ failCommit: true });
    const noCommit = createUnitOfWork(opener);
    const committed = await noCommit.withUnitOfWork(async () => ok(1));
    expect(committed.ok).toBe(false);
    if (!committed.ok)
      expect(committed.error.details).toEqual({ reason: "commit-failed" });
    expect(opener.transactions.map((t) => t.state)).toEqual(["rolled-back"]);
  });

  it("a token from another binding does not resolve", async () => {
    const a = createUnitOfWork(memoryTransactionOpener());
    const b = createUnitOfWork(memoryTransactionOpener());
    await a.withUnitOfWork(async (uow) => {
      expect(b.transactionOf(uow)).toBeUndefined();
      return ok(undefined);
    });
  });
});

describe("platform — the RPC-boundary opener (ADR-127: one RPC is one transaction)", () => {
  it("mints a ledger row on begin, drops it on commit, and counts the outcome", async () => {
    const opener = rpcTransactionOpener();
    const binding = createUnitOfWork(opener);
    const result = await binding.withUnitOfWork(async (uow) => {
      expect(binding.transactionOf(uow)).toEqual({ id: 1, rpcCount: 0 });
      expect(opener.open).toHaveLength(1);
      return ok("done");
    });
    expect(result).toEqual({ ok: true, value: "done" });
    expect(opener.open).toEqual([]);
    expect(opener.settled).toEqual({ committed: 1, rolledBack: 0 });
  });

  it("claims the one RPC through the join and refuses a second", async () => {
    const opener = rpcTransactionOpener();
    const binding = createUnitOfWork(opener);
    await binding.withUnitOfWork(async (uow) => {
      expect(binding.join.isOpen(uow)).toBe(true);
      expect(binding.join.claimRpc(uow)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(binding.transactionOf(uow)?.rpcCount).toBe(1);
      const second = binding.join.claimRpc(uow);
      expect(!second.ok && second.error.details?.reason).toBe(
        "second-rpc-in-unit-of-work",
      );
      return ok(undefined);
    });
    expect(opener.settled.committed).toBe(1);
  });

  it("rolls back on an error — a ledger close, never a database call — and the token stops resolving", async () => {
    const opener = rpcTransactionOpener();
    const binding = createUnitOfWork(opener);
    let token: UnitOfWork | undefined;
    const result = await binding.withUnitOfWork(async (uow) => {
      token = uow;
      return err("CONFLICT", "no", { reason: "stage" });
    });
    expect(result.ok).toBe(false);
    expect(opener.settled).toEqual({ committed: 0, rolledBack: 1 });
    expect(token !== undefined && binding.join.isOpen(token)).toBe(false);
    const stale = binding.join.claimRpc(token as UnitOfWork);
    expect(!stale.ok && stale.error.details?.reason).toBe(
      "unit-of-work-unknown",
    );
  });

  it("refuses a token another binding minted, and one that never was", () => {
    const a = createUnitOfWork(rpcTransactionOpener());
    const b = createUnitOfWork(rpcTransactionOpener());
    const foreign = {} as UnitOfWork;
    expect(a.join.isOpen(foreign)).toBe(false);
    const claimed = b.join.claimRpc(foreign);
    expect(!claimed.ok && claimed.error.details?.reason).toBe(
      "unit-of-work-unknown",
    );
  });

  it("the memory opener places no limit on claims — it is a real begin / commit / rollback ledger", async () => {
    const binding = createUnitOfWork(memoryTransactionOpener());
    await binding.withUnitOfWork(async (uow) => {
      expect(binding.join.claimRpc(uow).ok).toBe(true);
      expect(binding.join.claimRpc(uow).ok).toBe(true);
      return ok(undefined);
    });
  });

  it("settling a handle twice is refused by the opener itself", async () => {
    const opener = rpcTransactionOpener();
    const begun = await opener.begin();
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    expect((await opener.commit(begun.value)).ok).toBe(true);
    const again = await opener.rollback(begun.value);
    expect(!again.ok && again.error.details?.reason).toBe(
      "unit-of-work-not-open",
    );
  });
});

describe("platform — the module-level withUnitOfWork", () => {
  it("fails closed (INTERNAL, unit-of-work-not-configured) until the boot code configures a binding", async () => {
    const result = await withUnitOfWork(async () => ok(1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.details).toEqual({
        reason: "unit-of-work-not-configured",
      });
    }
    expect(currentUnitOfWork()).toBeUndefined();
    // The module-level join fails closed the same way: no binding, no open token.
    expect(unitOfWorkJoin.isOpen({} as UnitOfWork)).toBe(false);
    const claimed = unitOfWorkJoin.claimRpc({} as UnitOfWork);
    expect(!claimed.ok && claimed.error.details?.reason).toBe(
      "unit-of-work-unknown",
    );
  });

  it("delegates to the configured binding — the join included", async () => {
    const opener = memoryTransactionOpener();
    configureUnitOfWork(createUnitOfWork(opener));
    const result = await withUnitOfWork(async (uow) => {
      expect(currentUnitOfWork()).toBe(uow);
      expect(unitOfWorkJoin.isOpen(uow)).toBe(true);
      return ok("via default");
    });
    expect(result).toEqual({ ok: true, value: "via default" });
    expect(opener.transactions.map((t) => t.state)).toEqual(["committed"]);
  });
});
