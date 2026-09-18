// The admin erasure road (07 §6.1; 07 §5.4 rows 1–2 and 6; ADR-145). Four claims, each driven:
//
//   1. **MFA at the action, not at the layout.** `src/app/admin/layout.tsx` carries no auth guard, so an `aal1`
//      admin session is refused here or nowhere. Both actions are asserted, because a gate on one of two roads is
//      not a gate.
//   2. **Step 1 records and does not erase.** An address is caller input and an admin transcribing one from an
//      email can mistype it; the consequence of a typo has to be a wrong row, never a wrong erasure.
//   3. **★ Step 2 takes a request id and nothing else.** The subject is read off the row inside the connector.
//      The assertion is on the shape of what travels — that `runRequest` is called with the id and that no user
//      id reaches the connector from the caller at all.
//   4. **Role first, budget second** (REVIEW-3 security M-4): a refused caller does not first buy a read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN = "admin-1";
const SUBJECT = "someone-who-asked";
const REQUEST = "req-7";

const request = {
  requestId: REQUEST,
  subjectUserId: SUBJECT,
  road: "admin" as const,
  state: "requested" as const,
  refusalReason: null,
  requestedAt: "2026-09-20T00:00:00.000Z",
};

function stubs(options?: { readonly role?: "ok" | "mfa" }) {
  const openRequestForEmail = vi.fn(async () => ({
    ok: true as const,
    value: request,
  }));
  const runRequest = vi.fn(async () => ({
    ok: true as const,
    value: {
      outcome: "erased" as const,
      retainedClasses: ["money", "consent", "safeguarding"] as const,
      scrubbedTables: ["parents"],
      objectCount: 0,
    },
  }));
  const consume = vi.fn(async () => ({ ok: true as const, value: {} }));
  vi.doMock("@/modules/auth", () => ({
    auth: {
      requireRole: async () =>
        options?.role === "mfa"
          ? {
              ok: false,
              error: {
                code: "FORBIDDEN",
                message: "no",
                details: { reason: "mfa" },
              },
            }
          : { ok: true, value: { userId: ADMIN, role: "admin" } },
    },
  }));
  vi.doMock("@/modules/platform", async () => {
    const actual =
      await vi.importActual<typeof import("@/modules/platform")>(
        "@/modules/platform",
      );
    return {
      ...actual,
      privacy: { ...actual.privacy, openRequestForEmail, runRequest },
      rateLimiter: { ...actual.rateLimiter, consume },
    };
  });
  return { openRequestForEmail, runRequest, consume };
}

const form = (email: string) => {
  const data = new FormData();
  data.set("email", email);
  return data;
};

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.doUnmock("@/modules/auth");
  vi.doUnmock("@/modules/platform");
  vi.resetModules();
});

describe("admin/erasure — step 1 records the request that arrived by email", () => {
  it("resolves the address through the connector and erases nothing", async () => {
    const { openRequestForEmail, runRequest } = stubs();
    const { openErasureRequestAction } =
      await import("../erasure/actions/open-erasure-request-action");

    const result = await openErasureRequestAction(
      null,
      form("asked@example.test"),
    );
    expect(result.ok).toBe(true);
    expect(openRequestForEmail).toHaveBeenCalledWith({
      email: "asked@example.test",
      requestedBy: ADMIN,
    });
    // The whole reason this is its own step: a mistyped address must cost a row, not a person.
    expect(runRequest).not.toHaveBeenCalled();
  });

  it("★ refuses an `aal1` admin — the layout has no guard, so this is the only one", async () => {
    const { openRequestForEmail, consume } = stubs({ role: "mfa" });
    const { openErasureRequestAction } =
      await import("../erasure/actions/open-erasure-request-action");

    const result = await openErasureRequestAction(
      null,
      form("asked@example.test"),
    );
    expect(result.ok).toBe(false);
    expect(openRequestForEmail).not.toHaveBeenCalled();
    // Role first, budget second: a refused caller does not spend anything (REVIEW-3 security M-4).
    expect(consume).not.toHaveBeenCalled();
  });

  it("refuses something that is not an address, without reaching the connector", async () => {
    const { openRequestForEmail } = stubs();
    const { openErasureRequestAction } =
      await import("../erasure/actions/open-erasure-request-action");

    const result = await openErasureRequestAction(null, form("not-an-address"));
    expect(result.ok).toBe(false);
    expect(openRequestForEmail).not.toHaveBeenCalled();
  });
});

describe("admin/erasure — step 2 names a request, never a person (ADR-145; 07 §5.4 row 6)", () => {
  it("★ passes the request id to the connector, and no subject travels from the caller", async () => {
    const { runRequest } = stubs();
    const { runErasureRequestAction } =
      await import("../erasure/actions/run-erasure-request-action");

    const result = await runErasureRequestAction({ requestId: REQUEST });
    expect(result.ok).toBe(true);
    expect(runRequest).toHaveBeenCalledWith(REQUEST);
    // One argument, and it is the id. The subject is the row's, read inside the connector.
    expect(runRequest.mock.calls[0]).toHaveLength(1);
  });

  it("★ ignores a subject the caller tries to add — it is not a parameter of this road", async () => {
    const { runRequest } = stubs();
    const { runErasureRequestAction } =
      await import("../erasure/actions/run-erasure-request-action");

    await runErasureRequestAction({
      requestId: REQUEST,
      // A caller adding this is the attack ADR-145 is about. The action's own shape is what refuses it: there is
      // nowhere for the value to go, and the connector is still called with the id alone.
      subjectUserId: "somebody-else",
    } as { requestId: string });
    expect(runRequest).toHaveBeenCalledWith(REQUEST);
    expect(JSON.stringify(runRequest.mock.calls[0])).not.toContain(
      "somebody-else",
    );
  });

  it("★ refuses an `aal1` admin here too", async () => {
    const { runRequest } = stubs({ role: "mfa" });
    const { runErasureRequestAction } =
      await import("../erasure/actions/run-erasure-request-action");

    const result = await runErasureRequestAction({ requestId: REQUEST });
    expect(result.ok).toBe(false);
    expect(runRequest).not.toHaveBeenCalled();
  });

  it("refuses a missing or empty request id", async () => {
    const { runRequest } = stubs();
    const { runErasureRequestAction } =
      await import("../erasure/actions/run-erasure-request-action");

    for (const bad of [{}, { requestId: "" }, { requestId: 7 }]) {
      const result = await runErasureRequestAction(
        bad as { requestId: string },
      );
      expect(result.ok).toBe(false);
    }
    expect(runRequest).not.toHaveBeenCalled();
  });
});
