// The §5.4.3 dispatch table as a **pure** function: (the family's row, a verified provider event, now) → the patch
// to write, the events to emit, whether `app-ready` goes out, and whether anything happened at all. No I/O, so
// every row of the table is a unit test. The write itself is `create-payments.ts`'s.
//
//   purchase.completed { deposit }                     → deposit stamped, `deposit.paid`, **no access** (ADR-097)
//   purchase.completed { balance | custom | checkout } → upfront ⇒ paid_in_full · instalments ⇒ active{1, X−1};
//                                                        `bundle.paid`, plus `access.opened` + app-ready unless the
//                                                        family was already `placed` (ADR-093)
//   instalment.paid[i]                                 → paidCount i, standing good; i = X ⇒ paid_in_full
//   instalment.failed                                  → past_due, grace = now + pastDueGraceDays, `bundle.payment-failed`
//   schedule.cancelled                                 → cancelled at paidCount; access to the period end (§5.4.5)
//   refunded                                           → ledger row only; a deposit refund stamps `deposit_refunded_at`
//
// A money event that does not fit the row it lands on (a second purchase for a paid family, an instalment for a
// family with no schedule) is **ignored with no state change** — never a guessed transition.
import { PRICES } from "@/modules/config";
import type { PurchaseEvent } from "@/modules/purchase-paths";
import type { EventName, Instant } from "@/modules/shared-types";
import { addDays } from "./add-days";
import { addMonths } from "./add-months";
import type { SpinePatch, SpineRow } from "./spine-store";

export type MoneyEventName = Extract<
  EventName,
  | `bundle.${string}`
  | `deposit.${string}`
  | `access.${string}`
  | "payment.due"
  | "trial.started"
>;

export type Transition = {
  readonly patch: SpinePatch;
  readonly events: ReadonlyArray<MoneyEventName>;
  readonly appReady: boolean;
  readonly handled: "handled" | "ignored";
};

type MoneyEvent = Exclude<PurchaseEvent, { kind: "ignored" }>;

const MONTHS_PER_INSTALMENT = 1;
const PAYING: ReadonlySet<SpineRow["status"]> = new Set(["active", "past_due"]);
const PAID: ReadonlySet<SpineRow["status"]> = new Set([
  "active",
  "past_due",
  "paid_in_full",
  "cancelled",
]);

const ignored: Transition = Object.freeze({
  patch: {},
  events: [],
  appReady: false,
  handled: "ignored",
});

const handled = (
  patch: SpinePatch,
  events: ReadonlyArray<MoneyEventName>,
  appReady = false,
): Transition => Object.freeze({ patch, events, appReady, handled: "handled" });

function deposit(
  row: SpineRow,
  event: Extract<MoneyEvent, { kind: "purchase.completed" }>,
): Transition {
  if (row.deposit_paid_at !== null) return handled({}, []);
  return handled(
    {
      deposit_paid_at: event.at,
      deposit_pence: event.paid.pence,
      price_preset: "deposit",
    },
    ["deposit.paid"],
  );
}

function purchase(
  row: SpineRow,
  event: Extract<MoneyEvent, { kind: "purchase.completed" }>,
): Transition {
  if (PAID.has(row.status)) return ignored;
  const wasPlaced = row.status === "placed";
  const events: ReadonlyArray<MoneyEventName> = wasPlaced
    ? ["bundle.paid"]
    : ["bundle.paid", "access.opened"];
  const shared: SpinePatch = {
    purchased_at: event.at,
    price_pence: event.paid.pence,
    price_preset: event.preset,
    purchase_path: event.linkKind === "checkout" ? "self_serve" : "payment_link",
    past_due_grace_ends_at: null,
    cancelled_at: null,
  };
  const count = event.shape.kind === "instalments" ? event.shape.count : 1;
  if (count <= 1)
    return handled(
      { ...shared, status: "paid_in_full", plan_shape: "upfront" },
      events,
      !wasPlaced,
    );
  return handled(
    {
      ...shared,
      status: "active",
      plan_shape: "instalments",
      instalments_total: count,
      instalments_paid: 1,
      current_period_ends_at: addMonths(event.at, MONTHS_PER_INSTALMENT),
    },
    events,
    !wasPlaced,
  );
}

function instalmentPaid(
  row: SpineRow,
  event: Extract<MoneyEvent, { kind: "instalment.paid" }>,
): Transition {
  if (!PAYING.has(row.status) || row.instalments_total === null) return ignored;
  const paid = Math.max(row.instalments_paid ?? 0, event.index);
  const complete = paid >= row.instalments_total;
  return handled(
    {
      status: complete ? "paid_in_full" : "active",
      instalments_paid: paid,
      past_due_grace_ends_at: null,
      current_period_ends_at: complete
        ? null
        : addMonths(event.at, MONTHS_PER_INSTALMENT),
    },
    [],
  );
}

function instalmentFailed(row: SpineRow, now: Instant): Transition {
  if (!PAYING.has(row.status)) return ignored;
  return handled(
    {
      status: "past_due",
      past_due_grace_ends_at: addDays(now, PRICES.pastDueGraceDays),
    },
    ["bundle.payment-failed"],
  );
}

function scheduleCancelled(
  row: SpineRow,
  event: Extract<MoneyEvent, { kind: "schedule.cancelled" }>,
): Transition {
  if (!PAYING.has(row.status)) return ignored;
  return handled(
    {
      status: "cancelled",
      cancelled_at: event.at,
      instalments_paid: Math.max(row.instalments_paid ?? 0, event.paidCount),
    },
    [],
  );
}

function refunded(
  row: SpineRow,
  event: Extract<MoneyEvent, { kind: "refunded" }>,
): Transition {
  if (row.deposit_link_ref !== null && row.deposit_link_ref === event.ref)
    return handled({ deposit_refunded_at: event.at }, ["deposit.refunded"]);
  return handled({}, []);
}

export function dispatchPurchaseEvent(
  row: SpineRow,
  event: MoneyEvent,
  now: Instant,
): Transition {
  switch (event.kind) {
    case "purchase.completed":
      return event.linkKind === "deposit"
        ? deposit(row, event)
        : purchase(row, event);
    case "instalment.paid":
      return instalmentPaid(row, event);
    case "instalment.failed":
      return instalmentFailed(row, now);
    case "schedule.cancelled":
      return scheduleCancelled(row, event);
    case "refunded":
      return refunded(row, event);
  }
}
