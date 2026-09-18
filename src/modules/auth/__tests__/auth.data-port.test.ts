// The data-access port (01 §6.3 amended; 03 §1.4): `run` over the narrow `Query` surface with a named operation,
// the two scopes, the unit-of-work join (ADR-127 — one RPC is one transaction), and `signUrl` — the one
// signed-URL minter (07 §5.3 rule 1). Plus the module binding: a faithful pass-through to whatever
// `configureAuth` installed.
import { describe, expect, it, vi } from "vitest";
import { auth, configureAuth, createAuth, stubAuth } from "@/modules/auth";
import type { NamedOperation, StorageRef } from "../types";
import type { UnitOfWork } from "@/modules/shared-types";
import { SECURITY } from "@/modules/config";
import {
  configureUnitOfWork,
  createUnitOfWork,
  memoryTransactionOpener,
  rpcTransactionOpener,
  withUnitOfWork,
} from "@/modules/platform";
import { fakeDriver } from "./fixtures/fake-driver";

const anOperation = (
  exec: NamedOperation<string>["exec"] = async () => "done",
): NamedOperation<string> => ({ name: "auth.readSomething", exec });

const A_REF: StorageRef = {
  bucket: "verification-documents",
  path: "11111111-1111-4111-8111-111111111111/identity/passport.pdf",
};

describe("DataAccessPort.run", () => {
  it("runs the operation against the session scope by default", async () => {
    const { driver, state } = fakeDriver();
    const result = await createAuth({ driver }).data.run(anOperation());
    expect(result).toEqual({ ok: true, value: "done" });
    expect(state.scopes).toEqual(["session"]);
  });

  it("uses the service scope only when asked (01 §6.3 — named uses)", async () => {
    const { driver, state } = fakeDriver();
    await createAuth({ driver }).data.run(anOperation(), { scope: "service" });
    expect(state.scopes).toEqual(["service"]);
  });

  it("leaves an audit line naming the operation whenever RLS is bypassed", async () => {
    const lines: Array<{ msg: string; fields: unknown }> = [];
    vi.resetModules();
    vi.doMock("@/modules/platform", async (importOriginal) => {
      const actual = await importOriginal<Record<string, unknown>>();
      return {
        ...actual,
        log: {
          debug: () => undefined,
          info: (msg: string, fields?: unknown) => lines.push({ msg, fields }),
          warn: () => undefined,
          error: () => undefined,
        },
      };
    });
    const { createAuth: build } = await import("../lib/create-auth");
    const { fakeDriver: fake } = await import("./fixtures/fake-driver");
    const port = build({ driver: fake().driver }).data;
    await port.run(anOperation());
    expect(lines).toEqual([]);
    await port.run(anOperation(), { scope: "service" });
    expect(lines).toEqual([
      {
        msg: "service-scope data access",
        fields: {
          module: "auth",
          action: "auth.readSomething",
          scope: "service",
        },
      },
    ]);
    vi.doUnmock("@/modules/platform");
  });

  it("maps a thrown driver error to INTERNAL with the operation name, never the throw text", async () => {
    const { driver } = fakeDriver();
    const result = await createAuth({ driver }).data.run(
      anOperation(async () => {
        throw new Error("relation user_roles does not exist");
      }),
    );
    expect(result.ok === false && result.error.code).toBe("INTERNAL");
    expect(result.ok === false && result.error.message).not.toContain(
      "user_roles",
    );
    expect(result.ok === false && result.error.details).toMatchObject({
      module: "auth",
      action: "auth.readSomething",
    });
  });

  it("refuses a unit-of-work token no binding holds open, instead of silently running outside it", async () => {
    // ADR-127: the join is what makes `{ uow }` real. Before boot installs a binding (or for a token some other
    // binding minted) the port refuses, never runs the operation as if no unit of work had been asked for.
    const { driver, state } = fakeDriver();
    const result = await createAuth({ driver }).data.run(anOperation(), {
      uow: {} as UnitOfWork,
    });
    expect(result.ok === false && result.error.code).toBe("INTERNAL");
    expect(result.ok === false && result.error.details?.reason).toBe(
      "unit-of-work-unknown",
    );
    expect(state.scopes).toEqual([]);
  });
});

describe("DataAccessPort.run under a unit of work — one RPC is one transaction (ADR-127)", () => {
  /** A query double that counts RPCs and writes, so the test proves what reached the driver — not what was refused. */
  const countingDriver = (rpcThrows = false) => {
    const { driver } = fakeDriver();
    const calls = { rpc: 0, insert: 0, select: 0 };
    const query = {
      from: () => ({
        select: async () => {
          calls.select += 1;
          return [];
        },
        insert: async (row: unknown) => {
          calls.insert += 1;
          return row;
        },
        update: async (_id: unknown, patch: unknown) => {
          calls.insert += 1;
          return patch;
        },
      }),
      rpc: async () => {
        calls.rpc += 1;
        if (rpcThrows) throw new Error("function book_slot raised");
        return { booked: true };
      },
    } as never;
    return { driver: { ...driver, query: () => query }, calls };
  };

  const bookSlot = (): NamedOperation<unknown> => ({
    name: "call-layer.bookSlot",
    // The function writes `bookings` AND the `events` row — two writes, one RPC (03 §2.5; ADR-127).
    exec: (q) => q.rpc("book_slot", {} as never),
  });

  it("runs two writes inside one unit of work as exactly one RPC, and commits", async () => {
    const opener = rpcTransactionOpener();
    const binding = createUnitOfWork(opener);
    const { driver, calls } = countingDriver();
    const port = createAuth({ driver, unitOfWork: binding.join }).data;

    const result = await binding.withUnitOfWork(async (uow) => {
      const booked = await port.run(bookSlot(), { uow });
      expect(binding.transactionOf(uow)?.rpcCount).toBe(1);
      return booked;
    });

    expect(result).toEqual({ ok: true, value: { booked: true } });
    expect(calls).toEqual({ rpc: 1, insert: 0, select: 0 });
    expect(opener.settled).toEqual({ committed: 1, rolledBack: 0 });
    expect(opener.open).toEqual([]);
  });

  it("refuses a second RPC in the same unit of work — it would be a second transaction", async () => {
    const binding = createUnitOfWork(rpcTransactionOpener());
    const { driver, calls } = countingDriver();
    const port = createAuth({ driver, unitOfWork: binding.join }).data;

    const result = await binding.withUnitOfWork(async (uow) => {
      const first = await port.run(bookSlot(), { uow });
      expect(first.ok).toBe(true);
      return port.run(bookSlot(), { uow });
    });

    expect(result.ok === false && result.error.details?.reason).toBe(
      "second-rpc-in-unit-of-work",
    );
    expect(calls.rpc).toBe(1);
  });

  it("refuses a table write inside a unit of work — under PostgREST it could never be atomic with the RPC", async () => {
    const binding = createUnitOfWork(rpcTransactionOpener());
    const { driver, calls } = countingDriver();
    const port = createAuth({ driver, unitOfWork: binding.join }).data;

    const result = await binding.withUnitOfWork(async (uow) =>
      port.run(
        {
          name: "auth.writeRole",
          exec: (q) =>
            q
              .from("user_roles")
              .insert({ user_id: "u" as never, role: "parent" }),
        },
        { uow },
      ),
    );

    expect(result.ok === false && result.error.details?.reason).toBe(
      "write-outside-rpc",
    );
    expect(calls.insert).toBe(0);
  });

  it("lets a read through inside a unit of work", async () => {
    const binding = createUnitOfWork(rpcTransactionOpener());
    const { driver, calls } = countingDriver();
    const port = createAuth({ driver, unitOfWork: binding.join }).data;

    const result = await binding.withUnitOfWork(async (uow) =>
      port.run(
        { name: "auth.readRoles", exec: (q) => q.from("user_roles").select() },
        { uow },
      ),
    );

    expect(result).toEqual({ ok: true, value: [] });
    expect(calls.select).toBe(1);
  });

  it("turns a failing RPC into a Result error and rolls the unit of work back — never a throw across the connector", async () => {
    const opener = rpcTransactionOpener();
    const binding = createUnitOfWork(opener);
    const { driver } = countingDriver(true);
    const port = createAuth({ driver, unitOfWork: binding.join }).data;

    const result = await binding.withUnitOfWork(async (uow) =>
      port.run(bookSlot(), { uow }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.message).not.toContain("book_slot");
      expect(result.error.details).toMatchObject({
        module: "auth",
        action: "call-layer.bookSlot",
      });
    }
    expect(opener.settled).toEqual({ committed: 0, rolledBack: 1 });
  });

  it("defaults to platform's module-level join, so a boot-installed binding reaches a port built without one", async () => {
    const opener = rpcTransactionOpener();
    configureUnitOfWork(createUnitOfWork(opener));
    const { driver, calls } = countingDriver();
    const port = createAuth({ driver }).data;

    const result = await withUnitOfWork(async (uow) =>
      port.run(bookSlot(), { uow }),
    );

    expect(result.ok).toBe(true);
    expect(calls.rpc).toBe(1);
    expect(opener.settled.committed).toBe(1);
  });

  it("stub-auth honours a unit of work through the same join (03 §11 row 9)", async () => {
    const binding = createUnitOfWork(memoryTransactionOpener());
    const a = stubAuth({ unitOfWork: binding.join });

    const result = await binding.withUnitOfWork(async (uow) =>
      a.data.run(
        { name: "auth.readRoles", exec: (q) => q.from("user_roles").select() },
        { uow },
      ),
    );

    expect(result).toEqual({ ok: true, value: [] });
  });
});

describe("DataAccessPort.signUrl (07 §5.3 rule 1)", () => {
  it("mints a signed URL for a bucket object", async () => {
    const { driver, state } = fakeDriver();
    const result = await createAuth({ driver }).data.signUrl(
      A_REF,
      SECURITY.signedUrlTtlSeconds.verification,
    );
    expect(result.ok).toBe(true);
    expect(state.signedUrls).toEqual([
      { ref: A_REF, ttlSeconds: SECURITY.signedUrlTtlSeconds.verification },
    ]);
  });

  it.each([
    ["/leading-slash.pdf", "an absolute object path"],
    ["../other-user/passport.pdf", "a traversal"],
    ["a/../../b.pdf", "a traversal in the middle"],
    ["", "an empty path"],
  ])("refuses %s (%s) with VALIDATION", async (path) => {
    const { driver, state } = fakeDriver();
    const result = await createAuth({ driver }).data.signUrl(
      { bucket: "profile-pictures", path },
      60,
    );
    expect(result.ok === false && result.error.code).toBe("VALIDATION");
    expect(state.signedUrls).toEqual([]);
  });

  it.each([0, -1, 86_401])("refuses a %s-second TTL", async (ttl) => {
    const { driver } = fakeDriver();
    const result = await createAuth({ driver }).data.signUrl(A_REF, ttl);
    expect(result.ok === false && result.error.code).toBe("VALIDATION");
  });

  it("holds each bucket to its OWN ceiling, not the loosest one (07 §5.3 rule 1)", async () => {
    // Browse / profile reads get 24 h; DBS, right-to-work and ID evidence get 1 h. A flat global ceiling would
    // hand out a 24-hour link to a passport scan — 07 §10.1's `auth` row names "signed URL TTL 1 h" for exactly
    // this bucket.
    const { driver, state } = fakeDriver();
    const port = createAuth({ driver }).data;
    const day = SECURITY.signedUrlTtlSeconds.browse;

    const profile = await port.signUrl(
      { bucket: "profile-pictures", path: "parent/u/a.png" },
      day,
    );
    expect(profile.ok).toBe(true);

    const evidence = await port.signUrl(A_REF, day);
    expect(evidence.ok === false && evidence.error.code).toBe("VALIDATION");
    expect(evidence.ok === false && evidence.error.details?.reason).toBe(
      "invalid-ttl",
    );

    const appImage = await port.signUrl(
      { bucket: "development-images", path: "children/c-1/a.png" },
      day,
    );
    expect(appImage.ok).toBe(false);

    // Only the one that was within its own bucket's ceiling reached the driver.
    expect(state.signedUrls.map((s) => s.ref.bucket)).toEqual([
      "profile-pictures",
    ]);
  });

  it("maps a storage failure to INTERNAL", async () => {
    const { driver } = fakeDriver({ throwOn: "createSignedUrl" });
    const result = await createAuth({ driver }).data.signUrl(A_REF, 60);
    expect(result.ok === false && result.error.code).toBe("INTERNAL");
  });
});

describe("DataAccessPort.putObject / removeObject (ADR-155; 07 §5.3 rules 2–3)", () => {
  const BYTES = new Uint8Array([0xff, 0xd8, 0xff]);

  it("writes the object through the driver at SESSION scope, so the bucket's owner-prefix INSERT policy is the second check", async () => {
    const { driver, state } = fakeDriver();
    const result = await createAuth({ driver }).data.putObject(A_REF, BYTES, {
      contentType: "image/jpeg",
      metadata: { uploaded_by: "u-1", entity_kind: "verification" },
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(state.puts).toEqual([
      {
        ref: A_REF,
        bytes: 3,
        contentType: "image/jpeg",
        metadata: { uploaded_by: "u-1", entity_kind: "verification" },
        scope: "session",
      },
    ]);
  });

  it("removes the object through the driver at SERVICE scope — no user role holds DELETE on the bucket", async () => {
    const { driver, state } = fakeDriver();
    const result = await createAuth({ driver }).data.removeObject(A_REF);
    expect(result).toEqual({ ok: true, value: undefined });
    expect(state.removes).toEqual([{ ref: A_REF, scope: "service" }]);
  });

  it.each([
    ["/leading-slash.pdf", "an absolute object path"],
    ["../other-user/passport.pdf", "a traversal"],
    ["", "an empty path"],
  ])(
    "refuses %s (%s) for both writes, before the driver is touched",
    async (path) => {
      const { driver, state } = fakeDriver();
      const port = createAuth({ driver }).data;
      const put = await port.putObject(
        { bucket: "verification-documents", path },
        BYTES,
        {
          contentType: "image/jpeg",
        },
      );
      const removed = await port.removeObject({
        bucket: "verification-documents",
        path,
      });
      expect(put.ok === false && put.error.code).toBe("VALIDATION");
      expect(removed.ok === false && removed.error.code).toBe("VALIDATION");
      expect(state.puts).toEqual([]);
      expect(state.removes).toEqual([]);
    },
  );

  it("refuses an empty body — an object with no bytes is never a retained upload", async () => {
    const { driver, state } = fakeDriver();
    const result = await createAuth({ driver }).data.putObject(
      A_REF,
      new Uint8Array(0),
      {
        contentType: "image/jpeg",
      },
    );
    expect(result.ok === false && result.error.code).toBe("VALIDATION");
    expect(state.puts).toEqual([]);
  });

  it("maps a driver failure to a Result, never a throw", async () => {
    const { driver } = fakeDriver({ throwOn: "putObject" });
    const put = await createAuth({ driver }).data.putObject(A_REF, BYTES, {
      contentType: "image/jpeg",
    });
    expect(put.ok).toBe(false);
    const { driver: driver2 } = fakeDriver({ throwOn: "removeObject" });
    const removed = await createAuth({ driver: driver2 }).data.removeObject(
      A_REF,
    );
    expect(removed.ok).toBe(false);
  });
});

describe("the module binding (03 §9.5 registry pattern)", () => {
  it("delegates every method to whatever configureAuth installed", async () => {
    const { driver, state } = fakeDriver();
    configureAuth(createAuth({ driver }));
    expect(await auth.getSession()).toEqual({ ok: true, value: null });
    expect(await auth.data.run(anOperation())).toEqual({
      ok: true,
      value: "done",
    });
    expect(state.scopes).toEqual(["session"]);
  });

  it("re-reads the registry on every call, so a later configureAuth wins", async () => {
    configureAuth(createAuth({ driver: fakeDriver().driver }));
    const second = fakeDriver({ user: null });
    configureAuth(createAuth({ driver: second.driver }));
    await auth.data.run(anOperation(), { scope: "service" });
    expect(second.state.scopes).toEqual(["service"]);
  });

  it("exposes data as a live port, not a snapshot taken at import time", async () => {
    const { driver, state } = fakeDriver();
    configureAuth(createAuth({ driver }));
    await auth.data.signUrl(A_REF, 60);
    expect(state.signedUrls).toHaveLength(1);
  });
});
