// withUnitOfWork (01 §6.3; 03 §1.4): commit on ok, roll back on error / throw, nested calls join the outer,
// the opaque token resolves to the opener's handle only through the binding that minted it; the module-level
// default fails closed until the boot code configures a binding.
import { describe, expect, it } from "vitest";
import {
  configureUnitOfWork,
  createUnitOfWork,
  currentUnitOfWork,
  err,
  memoryTransactionOpener,
  ok,
  withUnitOfWork,
} from "@/modules/platform";

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
  });

  it("delegates to the configured binding", async () => {
    const opener = memoryTransactionOpener();
    configureUnitOfWork(createUnitOfWork(opener));
    const result = await withUnitOfWork(async (uow) => {
      expect(currentUnitOfWork()).toBe(uow);
      return ok("via default");
    });
    expect(result).toEqual({ ok: true, value: "via default" });
    expect(opener.transactions.map((t) => t.state)).toEqual(["committed"]);
  });
});
