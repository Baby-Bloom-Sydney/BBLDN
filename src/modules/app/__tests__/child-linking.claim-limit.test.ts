// ── REVIEW-2 (security HIGH-1) — the invite **claim** is inside 07 §8 row 7's budget ──────────────────────
//
// `consume-invite-lookup-limit.ts` says in its own header that the limit "is the enumeration defence, and it is
// the whole of it": a child invite has no expiry and no rotation, and 32^8 is only infeasible to walk if walking
// it is rate-limited. REVIEW-2 found the limit consumed in exactly one place — `load-invite-landing.ts`, the
// server-component GET. `claimInviteAction` is a `"use server"` export, i.e. an HTTP endpoint of its own, and it
// reached `store.invitePreview(token)` through `childLinking.claimInvite` with no counter at all.
//
// The oracle that makes it worth closing: `carry-link-store-error.ts` returns four *different* sentences for a
// live token (wrong side of the app / sent to someone else / child already claimed / already has a nanny) and a
// fifth for a dead one. Unlimited, that is a token walker with a readable answer per guess.
//
// Both cases below were written first and verified RED against the shipped action.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECURITY } from "@/modules/config";
import {
  configureRateLimiter,
  createRateLimiter,
  err,
  memoryRateLimitStore,
  ok,
} from "@/modules/platform";

const redirects: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirects.push(to);
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: () => ({ get: () => "203.0.113.7" }),
}));

const previews = vi.fn();
vi.mock("../child-linking/lib/default-child-linking", () => ({
  childLinking: {
    claimInvite: async (token: string) => {
      previews(token);
      return err("NOT_FOUND", "That link is no longer open.", {
        reason: "E_INVITE_NOT_FOUND",
      });
    },
  },
}));
vi.mock("../child-linking/lib/app-actor", () => ({
  appActor: async () => ({ kind: "user", id: "u-1", role: "parent" }),
}));

const { claimInviteAction } = await import(
  "../child-linking/actions/claim-invite-action"
);

const formOf = (token: string): FormData => {
  const data = new FormData();
  data.set("token", token);
  return data;
};

const freshLimiter = (): void => {
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
  );
};

beforeEach(() => {
  redirects.length = 0;
  previews.mockClear();
  freshLimiter();
});

describe("app/child-linking — the claim consumes 07 §8 row 7 (REVIEW-2)", () => {
  it("stops reaching the store once the IP's budget is spent — the walker runs out, not the token space", async () => {
    const attempts = SECURITY.rateLimits.inviteLookup.perMinute + 4;
    for (let n = 0; n < attempts; n += 1)
      await claimInviteAction(null, formOf(`AAAA-${String(n).padStart(4, "0")}`));
    // Every guess past the per-minute allowance is refused before `claimInvite` is called at all.
    expect(previews.mock.calls.length).toBeLessThan(attempts);
    expect(previews.mock.calls.length).toBeLessThanOrEqual(
      SECURITY.rateLimits.inviteLookup.perMinute,
    );
  });

  it("fails CLOSED when the limiter cannot answer — the same departure the landing page argues for", async () => {
    configureRateLimiter(
      { consume: async () => err("INTERNAL", "Rate limit unavailable") },
      "shared",
    );
    const answer = await claimInviteAction(null, formOf("ABCD-EFGH"));
    expect(answer.error).not.toBeNull();
    expect(previews).not.toHaveBeenCalled();
  });

  it("a throttled claim says nothing a guesser can read", async () => {
    configureRateLimiter(
      { consume: async () => err("RATE_LIMITED", "Too many") },
      "shared",
    );
    const answer = await claimInviteAction(null, formOf("ABCD-EFGH"));
    expect(answer.error).not.toBeNull();
    // No hint about whether the token was live, dead, someone else's, or the wrong side of the app.
    expect(answer.error ?? "").not.toMatch(
      /side of the app|someone else|already/i,
    );
  });

  it("spends a miss on a refused claim, so failed guesses buy the hour-long block (row 7)", async () => {
    const keys: string[] = [];
    configureRateLimiter(
      {
        consume: async (key: string) => {
          keys.push(key);
          return ok({ count: 1 });
        },
      },
      "shared",
    );
    await claimInviteAction(null, formOf("ABCD-EFGH"));
    // Two counters, as the landing page uses: the ordinary rate, then the failed-lookup counter whose window
    // is the block. A claim that refuses is a guess and must spend one of the five.
    expect(keys.some((key) => key.startsWith("invite-lookup:"))).toBe(true);
    expect(keys.some((key) => key.startsWith("invite-miss:"))).toBe(true);
  });
});
