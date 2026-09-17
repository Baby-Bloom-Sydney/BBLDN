// The §5.4.3 dispatch table, row by row, as a pure function — the claim this unit's merge rests on hardest.
// `dispatchPurchaseEvent` decides what one verified provider event does to one family's row; the webhook is the
// I/O around it. Every row of the document's table is a case here, and so is every row it does **not** have:
// an event that does not fit the standing it lands on must be `ignored` with no state change, never a guess.
import { describe, expect, it } from "vitest";
import { PRICES } from "@/modules/config";
import type { PurchaseEvent } from "@/modules/purchase-paths";
import { blankSpineRow } from "../lib/blank-spine-row";
import { dispatchPurchaseEvent } from "../lib/dispatch-purchase-event";
import type { SpineRow } from "../lib/spine-store";
import type { FamilyId, Instant, LinkRef } from "@/modules/shared-types";

const FAMILY = "family-1" as FamilyId;
const NOW = "2026-03-01T09:00:00.000Z" as Instant;
const REF = "ref-1" as LinkRef;
const money = (pence: number) => ({ pence, currency: "GBP" }) as const;

const row = (patch: Partial<SpineRow> = {}): SpineRow => ({
  ...blankSpineRow(FAMILY, NOW),
  ...patch,
});

const completed = (
  linkKind: "deposit" | "balance-after-week-1" | "custom" | "checkout",
  shape: { kind: "upfront" } | { kind: "instalments"; count: number },
  pence: number,
): Extract<PurchaseEvent, { kind: "purchase.completed" }> => ({
  kind: "purchase.completed",
  eventId: "evt-1",
  ref: REF,
  linkKind,
  preset: linkKind === "checkout" ? "self-serve-app" : linkKind,
  shape,
  paid: money(pence),
  at: NOW,
});

describe("purchase.completed { deposit } (ADR-097)", () => {
  const out = dispatchPurchaseEvent(
    row(),
    completed("deposit", { kind: "upfront" }, PRICES.depositPence),
    NOW,
  );

  it("stamps the deposit and says so", () => {
    expect(out.patch.deposit_paid_at).toBe(NOW);
    expect(out.patch.deposit_pence).toBe(PRICES.depositPence);
    expect(out.events).toEqual(["deposit.paid"]);
  });

  it("opens NO access — no status change, no access.opened, no app-ready", () => {
    expect(out.patch.status).toBeUndefined();
    expect(out.events).not.toContain("access.opened");
    expect(out.appReady).toBe(false);
  });

  it("a second deposit event changes nothing and is still handled (idempotent)", () => {
    const again = dispatchPurchaseEvent(
      row({ deposit_paid_at: NOW, deposit_pence: PRICES.depositPence }),
      completed("deposit", { kind: "upfront" }, PRICES.depositPence),
      NOW,
    );
    expect(again.patch).toEqual({});
    expect(again.events).toEqual([]);
    expect(again.handled).toBe("handled");
  });
});

describe("purchase.completed { balance } — the bill paid", () => {
  it("upfront ⇒ paid_in_full, and a family who was NOT placed gets access + app-ready", () => {
    const out = dispatchPurchaseEvent(
      row(),
      completed("balance-after-week-1", { kind: "upfront" }, 75_000),
      NOW,
    );
    expect(out.patch.status).toBe("paid_in_full");
    expect(out.events).toEqual(["bundle.paid", "access.opened"]);
    expect(out.appReady).toBe(true);
  });

  it("a family who was already placed gets bundle.paid ONLY — her app is already on (ADR-093)", () => {
    const out = dispatchPurchaseEvent(
      row({ status: "placed", payment_due_at: NOW }),
      completed("balance-after-week-1", { kind: "upfront" }, 75_000),
      NOW,
    );
    expect(out.events).toEqual(["bundle.paid"]);
    expect(out.appReady).toBe(false);
  });

  it("instalments ⇒ active at 1 of X with the next period a month out", () => {
    const out = dispatchPurchaseEvent(
      row(),
      completed(
        "checkout",
        { kind: "instalments", count: PRICES.bundleMonthlyCount },
        PRICES.selfServeAppMonthlyPence,
      ),
      NOW,
    );
    expect(out.patch.status).toBe("active");
    expect(out.patch.instalments_total).toBe(PRICES.bundleMonthlyCount);
    expect(out.patch.instalments_paid).toBe(1);
    expect(out.patch.current_period_ends_at).toBe("2026-04-01T09:00:00.000Z");
    expect(out.patch.purchase_path).toBe("self_serve");
  });

  it("a family who has already paid is IGNORED, not charged twice into a new standing", () => {
    for (const status of ["active", "paid_in_full", "cancelled"] as const) {
      const out = dispatchPurchaseEvent(
        row({ status }),
        completed("balance-after-week-1", { kind: "upfront" }, 75_000),
        NOW,
      );
      expect(out.handled).toBe("ignored");
      expect(out.patch).toEqual({});
    }
  });
});

describe("instalment.paid / instalment.failed", () => {
  const paying = row({
    status: "active",
    plan_shape: "instalments",
    instalments_total: 12,
    instalments_paid: 1,
  });

  it("moves the count and stays active until the last one", () => {
    const out = dispatchPurchaseEvent(
      paying,
      { kind: "instalment.paid", eventId: "e", ref: REF, index: 2, paid: money(7_500), at: NOW },
      NOW,
    );
    expect(out.patch.instalments_paid).toBe(2);
    expect(out.patch.status).toBe("active");
  });

  it("the last one completes the bundle", () => {
    const out = dispatchPurchaseEvent(
      paying,
      { kind: "instalment.paid", eventId: "e", ref: REF, index: 12, paid: money(7_500), at: NOW },
      NOW,
    );
    expect(out.patch.status).toBe("paid_in_full");
    expect(out.patch.current_period_ends_at).toBeNull();
  });

  it("a refused payment opens the grace window from PRICES and says bundle.payment-failed", () => {
    const out = dispatchPurchaseEvent(
      paying,
      { kind: "instalment.failed", eventId: "e", ref: REF, index: 2, at: NOW },
      NOW,
    );
    expect(out.patch.status).toBe("past_due");
    expect(out.patch.past_due_grace_ends_at).toBe("2026-03-08T09:00:00.000Z");
    expect(PRICES.pastDueGraceDays).toBe(7);
    expect(out.events).toEqual(["bundle.payment-failed"]);
  });

  it("an instalment for a family with no schedule is IGNORED, never a guessed standing", () => {
    const out = dispatchPurchaseEvent(
      row(),
      { kind: "instalment.paid", eventId: "e", ref: REF, index: 1, paid: money(7_500), at: NOW },
      NOW,
    );
    expect(out.handled).toBe("ignored");
  });
});

describe("schedule.cancelled and refunded", () => {
  it("cancelling keeps the count and stamps the date — access runs to the period end (§5.4.5)", () => {
    const out = dispatchPurchaseEvent(
      row({ status: "active", instalments_total: 12, instalments_paid: 3 }),
      { kind: "schedule.cancelled", eventId: "e", ref: REF, at: NOW, paidCount: 3 },
      NOW,
    );
    expect(out.patch.status).toBe("cancelled");
    expect(out.patch.cancelled_at).toBe(NOW);
    expect(out.patch.instalments_paid).toBe(3);
  });

  it("a refund against the deposit ref stamps the refund and says deposit.refunded", () => {
    const out = dispatchPurchaseEvent(
      row({ deposit_link_ref: REF, deposit_paid_at: NOW }),
      { kind: "refunded", eventId: "e", ref: REF, amount: money(15_000), at: NOW },
      NOW,
    );
    expect(out.patch.deposit_refunded_at).toBe(NOW);
    expect(out.events).toEqual(["deposit.refunded"]);
  });

  it("any other refund is a ledger row only — no standing moves (refunds are by hand)", () => {
    const out = dispatchPurchaseEvent(
      row({ status: "paid_in_full" }),
      { kind: "refunded", eventId: "e", ref: REF, amount: money(75_000), at: NOW },
      NOW,
    );
    expect(out.patch).toEqual({});
    expect(out.events).toEqual([]);
    expect(out.handled).toBe("handled");
  });
});
