// ★ Security review H1 — the second, independent road to an `Actor`, and the check the first draft of it
// skipped. `auth.requireRole` refuses an admin session that never passed its second factor, and its own header
// says the check belongs there "and not only by the middleware". `appActor` is the other road, and
// `/invite/connect/[token]` requires no role at all — while a server action resolves by a build-global
// reference rather than by the route that rendered its form. So a password-only admin could have reached
// `createChildInviteAction` from an unprotected path and minted or revoked an invite for **any** child, with
// `aal2` — the control that exists to contain exactly that compromise — never consulted.
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/modules/auth", () => ({
  auth: {
    getSession: () => getSession(),
  },
}));

const sessionOf = (role: string, mfaVerified: boolean) => ({
  ok: true as const,
  value: {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role,
    mfaVerified,
    expiresAt: "2026-09-18T00:00:00.000Z",
  },
});

describe("appActor (07 §5.4 row 2)", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("★ a half-authenticated admin is not an actor at all", async () => {
    const { appActor } = await import("../child-linking/lib/app-actor");
    getSession.mockResolvedValue(sessionOf("admin", false));

    expect(await appActor()).toBeNull();
  });

  it("an admin who passed aal2 is one", async () => {
    const { appActor } = await import("../child-linking/lib/app-actor");
    getSession.mockResolvedValue(sessionOf("admin", true));

    expect((await appActor())?.kind).toBe("admin");
  });

  it("a parent and a nanny are actors on their own session, MFA or not", async () => {
    const { appActor } = await import("../child-linking/lib/app-actor");

    getSession.mockResolvedValue(sessionOf("parent", false));
    expect(await appActor()).toMatchObject({ kind: "user", role: "parent" });

    getSession.mockResolvedValue(sessionOf("nanny", false));
    expect(await appActor()).toMatchObject({ kind: "user", role: "nanny" });
  });

  it("a signed-out visitor is null, not a refusal — the landing page renders a state", async () => {
    const { appActor } = await import("../child-linking/lib/app-actor");
    getSession.mockResolvedValue({ ok: true, value: null });

    expect(await appActor()).toBeNull();
  });

  it("a session read that failed is null too — never a defaulted actor", async () => {
    const { appActor } = await import("../child-linking/lib/app-actor");
    getSession.mockResolvedValue({ ok: false, error: { code: "INTERNAL" } });

    expect(await appActor()).toBeNull();
  });
});
