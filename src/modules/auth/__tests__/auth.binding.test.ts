// The module-level `auth` binding must be a faithful pass-through: every method of the 03 §1.4 connector reaches
// the installed inside with the caller's arguments. A binding that quietly drops one is how a gate check goes
// missing without a single test failing.
import { describe, expect, it, vi } from "vitest";
import { auth, configureAuth, stubAuth } from "..";
import type { AppDatabase, Auth, NamedOperation } from "../types";
import type { Actor, UserId } from "@/modules/shared-types";

const ADMIN: Actor = {
  kind: "admin",
  id: "33333333-3333-4333-8333-333333333333" as never,
};
const USER = "11111111-1111-4111-8111-111111111111" as UserId;
const EMAIL = "someone@example.test" as never;

const spyingAuth = () => {
  const inner = stubAuth();
  const calls: string[] = [];
  const wrap =
    <A extends ReadonlyArray<unknown>, R>(name: string, fn: (...a: A) => R) =>
    (...args: A): R => {
      calls.push(`${name}(${JSON.stringify(args)})`);
      return fn(...args);
    };
  const spied = {
    ...inner,
    getSession: wrap("getSession", inner.getSession),
    requireRole: wrap("requireRole", inner.requireRole),
    getCurrentUserId: wrap("getCurrentUserId", inner.getCurrentUserId),
    refreshSession: wrap("refreshSession", inner.refreshSession),
    needsPasswordSetup: wrap("needsPasswordSetup", inner.needsPasswordSetup),
    signUp: wrap("signUp", inner.signUp),
    signIn: wrap("signIn", inner.signIn),
    signOut: wrap("signOut", inner.signOut),
    setPassword: wrap("setPassword", inner.setPassword),
    handleAuthCallback: wrap("handleAuthCallback", inner.handleAuthCallback),
    grantRole: wrap("grantRole", inner.grantRole),
    data: {
      run: wrap("data.run", inner.data.run),
      signUrl: wrap("data.signUrl", inner.data.signUrl),
    },
  } as unknown as Auth<AppDatabase>;
  return { spied, calls };
};

describe("the `auth` binding delegates every method", () => {
  it("reaches the configured inside for each one, arguments intact", async () => {
    const { spied, calls } = spyingAuth();
    configureAuth(spied);
    const op: NamedOperation<number> = {
      name: "auth.count",
      exec: async () => 1,
    };
    const request = { nextUrl: {}, cookies: { getAll: () => [] } } as never;
    const response = { cookies: { set: vi.fn() } } as never;

    await auth.getSession();
    await auth.requireRole(["parent"]);
    await auth.getCurrentUserId();
    await auth.refreshSession(request, response);
    await auth.needsPasswordSetup();
    await auth.signUp({
      email: EMAIL,
      password: "a-long-enough-password",
      role: "parent",
    });
    await auth.signIn({ email: EMAIL, password: "a-long-enough-password" });
    await auth.setPassword("a-long-enough-password");
    await auth.handleAuthCallback("code");
    await auth.grantRole(USER, "nanny", ADMIN);
    await auth.signOut();
    await auth.data.run(op);
    await auth.data.signUrl(
      { bucket: "profile-pictures", path: "parent/u/a.png" },
      60,
    );

    expect(calls.map((c) => c.split("(")[0])).toEqual([
      "getSession",
      "requireRole",
      "getCurrentUserId",
      "refreshSession",
      "needsPasswordSetup",
      "signUp",
      "signIn",
      "setPassword",
      "handleAuthCallback",
      "grantRole",
      "signOut",
      "data.run",
      "data.signUrl",
    ]);
    expect(calls.find((c) => c.startsWith("requireRole"))).toContain("parent");
  });

  it("keeps the pure predicates local — they never need the inside", () => {
    const session = {
      userId: USER,
      role: "admin" as const,
      mfaVerified: true,
      expiresAt: "2026-09-16T00:00:00.000Z" as never,
    };
    expect([
      auth.isParent(session),
      auth.isNanny(session),
      auth.isAdmin(session),
    ]).toEqual([false, false, true]);
  });
});

describe("stub-auth's in-memory store (03 §11 row 9)", () => {
  it("refuses a second account on the same email", async () => {
    const a = stubAuth();
    await a.signUp({
      email: EMAIL,
      password: "a-long-enough-password",
      role: "parent",
    });
    await a.signOut();
    const again = await a.signUp({
      email: EMAIL,
      password: "a-long-enough-password",
      role: "parent",
    });
    expect(again.ok).toBe(false);
  });

  it("exchanges a user id as the callback code and signs that user in", async () => {
    const a = stubAuth({
      users: [{ id: "u-1", email: EMAIL, password: "p", role: "nanny" }],
    });
    const result = await a.handleAuthCallback("u-1");
    expect(result.ok === true && result.value.role).toBe("nanny");
  });

  it("serves a test schema through the same port", async () => {
    const a = stubAuth({ tables: { user_roles: [{ role: "parent" }] } });
    const result = await a.data.run({
      name: "auth.readRoles",
      exec: async (q) => q.from("user_roles" as never).select(),
    });
    expect(result).toEqual({ ok: true, value: [{ role: "parent" }] });
  });

  it("refuses a role grant for an account it does not know", async () => {
    const result = await stubAuth().grantRole(USER, "nanny", ADMIN);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("INTERNAL");
  });
});
