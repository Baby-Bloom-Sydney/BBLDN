// The three screens' contract with their routes (04 §6.2 S-P-10 / S-P-11 / S-P-12), read at the seam the route
// actually uses: the view decides what the screen offers, and the route turns that into a form or a redirect.
// The components themselves are server components over the same view the copy suite exhausts, so what is worth
// pinning here is the **wiring**, not the markup.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRICES } from "@/modules/config";
import type { Instant } from "@/modules/shared-types";
import { moneyPageView } from "../lib/money-page-view";
import type { AccessState } from "../types";

const AT = "2026-03-01T09:00:00.000Z" as Instant;
const LATER = "2026-04-01T09:00:00.000Z" as Instant;
const ROUTES = resolve(__dirname, "../../../app/parent");
const read = (file: string) => readFileSync(resolve(ROUTES, file), "utf8");

describe("what each standing offers the parent", () => {
  it("a placed family is told to wait for her matchmaker — she cannot pay from the app (ADR-094)", () => {
    const state: AccessState = {
      state: "placed",
      accessUntil: LATER,
      startedAt: AT,
      paymentDueAt: LATER,
      balance: { pence: 75_000, currency: "GBP" }, // config-literal-ok: an AccessState fixture — 03 §5.2 types `Money.currency` as this literal and the amount is what a row held
      firstWeekWages: { pence: 60_000, currency: "GBP" }, // config-literal-ok: same fixture
      satisfactionWindowEndsAt: LATER,
    };
    expect(moneyPageView(state).action.kind).toBe("ask-matchmaker");
  });

  it("a deposit-paid family is offered nothing to click and the gate stays shut (ADR-097)", () => {
    const view = moneyPageView({
      state: "deposit-paid",
      depositPaidAt: AT,
      pence: PRICES.depositPence,
    });
    expect(view.action.kind).toBe("ask-matchmaker");
    expect(view.open).toBe(false);
  });

  it("a family paying monthly is offered the hosted portal, and only she is", () => {
    const paying: AccessState = {
      state: "active",
      accessUntil: LATER,
      shape: { kind: "instalments", count: PRICES.bundleMonthlyCount },
      paidCount: 1,
      remaining: 11,
      nextPaymentAt: LATER,
      standing: "good",
    };
    expect(moneyPageView(paying).action.kind).toBe("manage");
    expect(
      moneyPageView({
        state: "paid-in-full",
        accessUntil: LATER,
        shape: { kind: "upfront" },
        paidAt: AT,
      }).action.kind,
    ).toBe("none");
  });

  it("a family whose month has ended is offered the two shapes; one whose access has run out is not", () => {
    expect(
      moneyPageView({ state: "lapsed", lapsedAt: AT, reason: "trial-ended" })
        .action.kind,
    ).toBe("choose-shape");
    expect(
      moneyPageView({ state: "lapsed", lapsedAt: AT, reason: "access-ended" })
        .action.kind,
    ).toBe("none");
  });
});

describe("the routes are thin and land where they should (05 §7 rule 5)", () => {
  it("all three send a signed-out visitor to login and a failed read to the dashboard", () => {
    for (const file of [
      "bundle/page.tsx",
      "subscribe/page.tsx",
      "subscription/page.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("loginRedirectUrl(ROUTE)");
      expect(source).toContain('load.kind === "failed"');
      // A failed read must never fall through to a rendered screen: that would show "nothing to pay" to a
      // paying family during an outage.
      expect(source).toContain("ROUTE_MAP.dashboards.parent");
    }
  });

  it("none of them is indexed — a money screen is never a search result", () => {
    for (const file of [
      "bundle/page.tsx",
      "subscribe/page.tsx",
      "subscription/page.tsx",
    ])
      expect(read(file)).toContain("robots: { index: false, follow: false }");
  });

  it("S-P-11 offers only the self-serve preset, and takes the shape from the form, never the amount", () => {
    const source = read("subscribe/page.tsx");
    expect(source).toContain('option.preset === "self-serve-app"');
    // The form carries a shape and a count; an amount posted by a stranger would be an amount we charged.
    expect(source).not.toMatch(/get\("(amount|pence|total)"\)/u);
  });

  // DOCUMENTED, NOT BUILT. 03 §5.2 says of `portal`: "The hosted portal; cancellation stays in-app." But
  // `PurchasePath` carries no cancel method — the document names a behaviour the contract gives no road to. The
  // Sydney `/parent/subscription/cancel` page is gone (it wrote Sydney columns), and rather than invent a
  // connector method on a money path, the claim is pinned. Owner: 03 §5.2.
  it.fails(
    "S-P-12 cancels in-app rather than through the hosted portal (03 §5.2)",
    async () => {
      const { payments } = await import("../lib/default-payments");
      expect(payments).toHaveProperty("cancel");
    },
  );
});

describe("the two money actions are rate limited, and refuse when the limiter cannot answer (ADR-134)", () => {
  // `security-reviewer`, `1h` MEDIUM-1. Both actions create a session at the purchase provider, so a parent in a
  // loop is unbounded provider cost. 07 §8 row 13's "no rate limit" is scoped to provider-retried,
  // signature-verified paths (webhooks and crons) and does not reach a session-authenticated server action.
  const actionSource = (file: string) =>
    readFileSync(resolve(__dirname, `../actions/${file}`), "utf8");

  it.each(["start-checkout-action.ts", "open-portal-action.ts"])(
    "%s consumes the limit before it calls the provider",
    (file) => {
      const source = actionSource(file);
      expect(source).toContain("consumeMoneyActionLimit");
      // Before, not after: a refused attempt must cost the provider nothing.
      expect(source.indexOf("consumeMoneyActionLimit(")).toBeLessThan(
        source.indexOf("await payments."),
      );
    },
  );

  it("the consumer fails closed — it never copies the public-read helper's fail-open choice", async () => {
    const source = readFileSync(
      resolve(__dirname, "../lib/consume-money-action-limit.ts"),
      "utf8",
    );
    // The public-read helper returns `null` (carry on) when the store cannot answer. This one returns a refusal
    // on every non-ok result, and only the *logging* branches on which it was.
    expect(source).toContain('return fail("E_PROVIDER"');
    expect(source).not.toMatch(/if \(!allowed\.ok\)[\s\S]{0,120}return null/u);
  });

  it("the policy is keyed on the family, never on an address", async () => {
    const { SECURITY } = await import("@/modules/config");
    expect(SECURITY.rateLimits.purchaseActions.key).toBe("user");
    expect(SECURITY.rateLimits.purchaseActions.perMinute).toBeGreaterThan(0);
  });
});
