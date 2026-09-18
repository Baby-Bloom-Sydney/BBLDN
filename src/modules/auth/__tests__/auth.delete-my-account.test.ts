// The self-service erasure road (07 §6.1; B-46). Four claims this merge rests on, each driven:
//
//   1. **The subject is the session's and there is no other way in.** The road takes no argument; the assertion
//      that matters is that the id handed to the job is the one `getCurrentUserId()` returned.
//   2. **No session, no erasure.** The road refuses before it reaches the limiter or the job.
//   3. **07 §8 row 20 fails closed.** A limiter that cannot answer refuses the erasure; it does not wave it
//      through. The failure to design against is an unbounded road to the one irreversible action in the product.
//   4. **A completed erasure signs her out.** `erase_account()` bans the `auth.users` row for ever, so the cookie
//      in her browser is a session for an account that admits nobody — and a refusal must NOT sign her out,
//      because she has to stay signed in to do the thing the refusal asked her to do.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUBJECT = "user-erasing-herself";

const erased = {
  ok: true as const,
  value: {
    outcome: "erased" as const,
    retainedClasses: ["money", "consent", "safeguarding"] as const,
    scrubbedTables: ["parents"],
    objectCount: 1,
  },
};

const refused = {
  ok: true as const,
  value: {
    outcome: "refused" as const,
    reason: "live-placement" as const,
    retainedClasses: ["money", "consent", "safeguarding"] as const,
    scrubbedTables: [],
    objectCount: 0,
  },
};

function stubs(options?: {
  readonly userId?: string | null;
  readonly limiterOk?: boolean;
  readonly answer?: typeof erased | typeof refused;
}) {
  const eraseOwnAccount = vi.fn(async () => options?.answer ?? erased);
  const signOut = vi.fn(async () => ({ ok: true, value: undefined }));
  const consume = vi.fn(async () =>
    options?.limiterOk === false
      ? {
          ok: false as const,
          error: { code: "INTERNAL" as const, message: "limiter is down" },
        }
      : { ok: true as const, value: { remaining: 4 } },
  );
  vi.doMock("../lib/default-auth", () => ({
    auth: {
      getCurrentUserId: async () => ({
        ok: true,
        value: options?.userId === undefined ? SUBJECT : options.userId,
      }),
      signOut,
    },
  }));
  vi.doMock("@/modules/platform", async () => {
    const actual =
      await vi.importActual<typeof import("@/modules/platform")>(
        "@/modules/platform",
      );
    return {
      ...actual,
      privacy: { ...actual.privacy, eraseOwnAccount },
      rateLimiter: { ...actual.rateLimiter, consume },
    };
  });
  return { eraseOwnAccount, signOut, consume };
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.doUnmock("../lib/default-auth");
  vi.doUnmock("@/modules/platform");
  vi.resetModules();
});

describe("auth/deleteMyAccount — the self-service road (07 §6.1)", () => {
  it("★ hands the job the SESSION's subject, and takes no subject of its own", async () => {
    const { eraseOwnAccount } = stubs();
    const { deleteMyAccount } = await import("../lib/delete-my-account");

    const result = await deleteMyAccount();
    expect(result.ok).toBe(true);
    expect(eraseOwnAccount).toHaveBeenCalledWith({ subjectUserId: SUBJECT });
    // The signature is the control: there is no argument for a caller to put another person's id into.
    expect(deleteMyAccount).toHaveLength(0);
  });

  it("★ refuses with no session, before the limiter and before the job", async () => {
    const { eraseOwnAccount, consume } = stubs({ userId: null });
    const { deleteMyAccount } = await import("../lib/delete-my-account");

    const result = await deleteMyAccount();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
    expect(consume).not.toHaveBeenCalled();
    expect(eraseOwnAccount).not.toHaveBeenCalled();
  });

  it("★ 07 §8 row 20 fails CLOSED — a limiter outage refuses the erasure, it does not wave it through", async () => {
    const { eraseOwnAccount } = stubs({ limiterOk: false });
    const { deleteMyAccount } = await import("../lib/delete-my-account");

    const result = await deleteMyAccount();
    expect(result.ok).toBe(false);
    expect(eraseOwnAccount).not.toHaveBeenCalled();
  });

  it("consumes the budget before the job, keyed per person", async () => {
    const { consume } = stubs();
    const { deleteMyAccount } = await import("../lib/delete-my-account");

    await deleteMyAccount();
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0][0]).toBe(`account-erasure:${SUBJECT}`);
  });

  it("★ signs her out once it has erased — the session is a cookie for a banned account", async () => {
    const { signOut } = stubs();
    const { deleteMyAccount } = await import("../lib/delete-my-account");

    await deleteMyAccount();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("★ and does NOT sign her out on a refusal — she has to stay in to do what it asked", async () => {
    const { signOut } = stubs({ answer: refused });
    const { deleteMyAccount } = await import("../lib/delete-my-account");

    const result = await deleteMyAccount();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outcome).toBe("refused");
    expect(signOut).not.toHaveBeenCalled();
  });
});
