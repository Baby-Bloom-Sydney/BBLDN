// `int.auth-gate` (05 §4.2): the middleware gate of 01 §4d end to end — prefix → role; no session → login with
// `next=`; wrong role → that user's own dashboard (AC-A-28); a signed-in passwordless account → set-password, never
// an error (ADR-042, 01 §4d step 3); `DEV_MODE` ignored in production; missing Supabase env fails the boot rather
// than bypassing the gate. Fixture: `seededUsers` — the in-memory `stub-auth` users the gate reads.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { configureAuth, stubAuth } from "@/modules/auth";
import type { StubAuthOptions } from "@/modules/auth";
import { middleware } from "@/middleware";
import { seededUsers } from "./fixtures/seeded-users";

const ORIGIN = "https://app.test";

const request = (path: string): NextRequest =>
  new NextRequest(new URL(path, ORIGIN));

const gateWith = (options: StubAuthOptions): void => {
  configureAuth(stubAuth(options));
};

const signedInAs = (key: keyof typeof seededUsers): void =>
  gateWith({
    users: Object.values(seededUsers),
    signedInUserId: seededUsers[key].id,
  });

const signedOut = (): void => gateWith({ users: Object.values(seededUsers) });

const locationOf = (res: Response): string => {
  const location = res.headers.get("location");
  expect(location).not.toBeNull();
  return (
    new URL(location as string).pathname + new URL(location as string).search
  );
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("no session on a protected route → login with next=", () => {
  it.each([
    "/parent",
    "/parent/request",
    "/nanny/settings",
    "/admin/dashboard",
  ])("redirects %s", async (path) => {
    signedOut();
    const res = await middleware(request(path));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe(`/login?next=${encodeURIComponent(path)}`);
  });

  it("leaves a public route alone", async () => {
    signedOut();
    const res = await middleware(request("/nannies"));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("prefix → required role (01 §4d step 2)", () => {
  it("lets a parent through /parent", async () => {
    signedInAs("parent");
    const res = await middleware(request("/parent"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends a nanny who opens /parent to her own dashboard", async () => {
    signedInAs("nanny");
    const res = await middleware(request("/parent/request"));
    expect(locationOf(res)).toBe("/nanny");
  });

  it("sends a non-admin who opens /admin to their own dashboard (AC-A-28)", async () => {
    signedInAs("parent");
    const res = await middleware(request("/admin/dashboard"));
    expect(locationOf(res)).toBe("/parent");
  });

  it("does not use the `next=` login redirect for a wrong role — the user is signed in", async () => {
    signedInAs("nanny");
    const res = await middleware(request("/admin"));
    expect(locationOf(res)).not.toContain("next=");
  });

  it("admits an admin with mfa to /admin", async () => {
    signedInAs("admin");
    const res = await middleware(request("/admin/dashboard"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends an admin without aal2 to login rather than into /admin (07 §5.4 row 2)", async () => {
    signedInAs("adminNoMfa");
    const res = await middleware(request("/admin/dashboard"));
    expect(locationOf(res)).toContain("/login");
  });

  it("leaves that admin on /login instead of bouncing them into a redirect loop", async () => {
    // 07 §5.4 row 2 wants an enrol / verify screen; none exists before the admin panels land, so the gate fails
    // closed to login — and must not then bounce them back to /admin/dashboard.
    signedInAs("adminNoMfa");
    const res = await middleware(request("/login"));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("(auth) routes for a signed-in user (01 §4d step 3)", () => {
  it("redirects a signed-in parent off /login to their dashboard", async () => {
    signedInAs("parent");
    const res = await middleware(request("/login"));
    expect(locationOf(res)).toBe("/parent");
  });

  it("leaves a signed-out visitor on /login", async () => {
    signedOut();
    const res = await middleware(request("/login"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("routes a signed-in passwordless account to set-password, never an error (ADR-042)", async () => {
    signedInAs("passwordless");
    const res = await middleware(request("/parent"));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe("/set-password");
  });

  it("routes the same account to set-password from inside the (auth) group too", async () => {
    signedInAs("passwordless");
    const res = await middleware(request("/login"));
    expect(locationOf(res)).toBe("/set-password");
  });

  it("does not loop: /set-password itself is left alone", async () => {
    signedInAs("passwordless");
    const res = await middleware(request("/set-password"));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("DEV_MODE (01 §4d step 4)", () => {
  it("is ignored in production: the gate still redirects", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEV_MODE", "true");
    // The production column of the public schema requires the tracker DSN (06 §2.5); supplying it keeps this
    // spec about `DEV_MODE`, not about env validation — which the last describe covers on its own.
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.test/1");
    vi.resetModules();
    const { middleware: prodMiddleware } = await import("@/middleware");
    const { configureAuth: configureProd, stubAuth: stubProd } =
      await import("@/modules/auth");
    configureProd(stubProd({ users: Object.values(seededUsers) }));
    const res = await prodMiddleware(request("/parent"));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toContain("/login");
  });

  it("bypasses the gate outside production", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_MODE", "true");
    vi.resetModules();
    const { middleware: devMiddleware } = await import("@/middleware");
    const { configureAuth: configureDev, stubAuth: stubDev } =
      await import("@/modules/auth");
    configureDev(stubDev({ users: Object.values(seededUsers) }));
    const res = await devMiddleware(request("/parent"));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("missing Supabase env fails the boot, it does not bypass the gate (01 §4d step 5)", () => {
  it("throws on import rather than returning next()", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.resetModules();
    await expect(import("@/middleware")).rejects.toThrow();
  });
});

describe("the matcher never gates the app's own static assets", () => {
  it("skips _next and file requests", async () => {
    const { config } = await import("@/middleware");
    const matcher = config.matcher[0];
    expect(matcher).toContain("_next/static");
    expect(matcher).toContain("_next/image");
  });
});
