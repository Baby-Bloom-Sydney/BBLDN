// The data-access port (01 §6.3 amended; 03 §1.4): `run` over the narrow `Query` surface with a named operation,
// the two scopes, the `uow` join, and `signUrl` — the one signed-URL minter (07 §5.3 rule 1). Plus the module
// binding: a faithful pass-through to whatever `configureAuth` installed.
import { describe, expect, it, vi } from "vitest";
import { auth, configureAuth, createAuth } from "@/modules/auth";
import type { NamedOperation, StorageRef } from "../types";
import type { UnitOfWork } from "@/modules/shared-types";
import { SECURITY } from "@/modules/config";
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

  it("refuses an unknown unit-of-work handle instead of silently running outside it", async () => {
    // The transaction opener behind `platform.withUnitOfWork` is not decided (03 §1.4; a KEY decision for S4 /
    // planner). Until it is, a `uow` a caller somehow holds must fail closed, never be ignored.
    const { driver } = fakeDriver();
    const result = await createAuth({ driver }).data.run(anOperation(), {
      uow: {} as UnitOfWork,
    });
    expect(result.ok === false && result.error.code).toBe("INTERNAL");
    expect(result.ok === false && result.error.details?.reason).toBe(
      "unit-of-work-not-supported",
    );
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
