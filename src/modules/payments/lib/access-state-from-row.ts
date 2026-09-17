// A spine row → 03 §5.2's `AccessState`, read at `now`. The mapping is `family_access_reason()` (0010 §7) in the
// same order, so the connector and the database gate can never disagree about a family: the admin toggle first
// (on **or** off, it wins), then `placed`, then a live trial, then a paid standing, then grace, then a cancelled
// period, else closed. A window the crons have not yet swept (a trial past `trial_ends_at`, grace past its end,
// a cancelled period past its end) reads as **lapsed** here exactly as the SQL gate reads it — the sweep writes
// the row, this read does not wait for it (see `access-gate/lib/decide-access.ts` for why that matters).
//
// The one standing the schema has no `status` for — a family that has paid its deposit and nothing else
// (ADR-097: no access) — is derived from the deposit columns on a holding row (`blank-spine-row.ts`).
import { LOCALE, PRICES } from "@/modules/config";
import type { Money, PlanShape } from "@/modules/purchase-paths";
import type { AdminId, Instant } from "@/modules/shared-types";
import type { AccessState, DepositRecord, LapseReason } from "../types";
import { balancePence } from "./balance-pence";
import type { SpineRow } from "./spine-store";

const money = (pence: number): Money => ({ pence, currency: LOCALE.currency });

const asInstant = (value: string): Instant => value as Instant;

const shapeOf = (row: SpineRow): PlanShape =>
  row.plan_shape === "instalments"
    ? { kind: "instalments", count: row.instalments_total ?? 0 }
    : { kind: "upfront" };

const depositOf = (row: SpineRow): DepositRecord | undefined =>
  row.deposit_paid_at === null
    ? undefined
    : {
        paidAt: asInstant(row.deposit_paid_at),
        pence: row.deposit_pence ?? 0,
        ...(row.deposit_refunded_at === null
          ? {}
          : { refundedAt: asInstant(row.deposit_refunded_at) }),
      };

const accessUntil = (row: SpineRow): Instant | null =>
  row.access_until === null ? null : asInstant(row.access_until);

const lapsed = (at: string, reason: LapseReason): AccessState => ({
  state: "lapsed",
  lapsedAt: asInstant(at),
  reason,
});

/** The reason a row that is already `lapsed` lapsed — the schema keeps no column for it, so it is derived. */
function lapseReason(row: SpineRow): LapseReason {
  if (row.access_until !== null && row.purchased_at !== null)
    return "access-ended";
  if (row.cancelled_at !== null) return "cancelled";
  if (row.past_due_grace_ends_at !== null) return "past-due";
  return "trial-ended";
}

function toggled(row: SpineRow, now: Instant): AccessState | null {
  if (row.access_toggled_on === null) return null;
  if (row.access_toggle_until !== null && row.access_toggle_until <= now)
    return null;
  return {
    state: "toggled",
    on: row.access_toggled_on,
    accessUntil: accessUntil(row),
    reason: row.access_toggle_reason ?? "",
    toggledBy: (row.access_toggled_by ?? "") as AdminId,
    at: asInstant(row.access_toggled_at ?? row.updated_at),
    ...(row.access_toggle_until === null
      ? {}
      : { until: asInstant(row.access_toggle_until) }),
  };
}

function placed(row: SpineRow): AccessState {
  const depositPaid =
    row.deposit_paid_at === null ? 0 : (row.deposit_pence ?? 0);
  const wages = row.first_week_wages_pence ?? 0;
  return {
    state: "placed",
    accessUntil: accessUntil(row),
    startedAt: asInstant(row.dfy_access_opened_at ?? row.updated_at),
    paymentDueAt: asInstant(row.payment_due_at ?? row.updated_at),
    balance: money(
      row.balance_pence ?? balancePence(PRICES.feePence, depositPaid, wages),
    ),
    firstWeekWages: money(wages),
    satisfactionWindowEndsAt: asInstant(
      row.satisfaction_window_ends_at ?? row.updated_at,
    ),
    ...(row.balance_link_ref === null
      ? {}
      : { linkSentAt: asInstant(row.updated_at) }),
  };
}

function paying(row: SpineRow, now: Instant): AccessState {
  const total = row.instalments_total ?? 0;
  const paidCount = row.instalments_paid ?? 0;
  const inGrace =
    row.status === "past_due" &&
    row.past_due_grace_ends_at !== null &&
    row.past_due_grace_ends_at > now;
  if (row.status === "past_due" && !inGrace)
    return lapsed(row.past_due_grace_ends_at ?? row.updated_at, "past-due");
  return {
    state: "active",
    accessUntil: accessUntil(row),
    shape: shapeOf(row),
    paidCount,
    remaining: Math.max(0, total - paidCount),
    nextPaymentAt:
      row.current_period_ends_at === null
        ? null
        : asInstant(row.current_period_ends_at),
    standing: inGrace ? "past-due" : "good",
    ...(inGrace && row.past_due_grace_ends_at !== null
      ? { graceUntil: asInstant(row.past_due_grace_ends_at) }
      : {}),
  };
}

function cancelled(row: SpineRow, now: Instant): AccessState {
  const ends = row.current_period_ends_at;
  if (ends === null || ends <= now)
    return lapsed(ends ?? row.cancelled_at ?? row.updated_at, "cancelled");
  return {
    state: "active",
    accessUntil: accessUntil(row),
    shape: shapeOf(row),
    paidCount: row.instalments_paid ?? 0,
    remaining: 0,
    nextPaymentAt: null,
    standing: "good",
    cancelledAt: asInstant(row.cancelled_at ?? row.updated_at),
  };
}

/** A `lapsed` row is either a family that lost access, or the holding row a deposit lands on (ADR-097). */
function holding(row: SpineRow): AccessState {
  const depositOnly =
    row.deposit_paid_at !== null &&
    row.deposit_refunded_at === null &&
    !row.has_used_trial &&
    row.purchased_at === null;
  if (depositOnly)
    return {
      state: "deposit-paid",
      depositPaidAt: asInstant(row.deposit_paid_at ?? row.updated_at),
      pence: row.deposit_pence ?? 0,
    };
  const hadAccess =
    row.has_used_trial ||
    row.purchased_at !== null ||
    row.cancelled_at !== null;
  return hadAccess
    ? lapsed(row.updated_at, lapseReason(row))
    : { state: "none" };
}

function standing(row: SpineRow, now: Instant): AccessState {
  const override = toggled(row, now);
  if (override !== null) return override;
  switch (row.status) {
    case "placed":
      return placed(row);
    case "trial":
      return row.trial_ends_at !== null && row.trial_ends_at > now
        ? {
            state: "trial",
            accessUntil: accessUntil(row),
            trialEndsAt: asInstant(row.trial_ends_at),
          }
        : lapsed(row.trial_ends_at ?? row.updated_at, "trial-ended");
    case "active":
    case "past_due":
      return paying(row, now);
    case "paid_in_full":
      return {
        state: "paid-in-full",
        accessUntil: accessUntil(row),
        shape: shapeOf(row),
        paidAt: asInstant(row.purchased_at ?? row.updated_at),
        ...(row.dfy_access_opened_at === null
          ? {}
          : { paidAtPlacement: asInstant(row.dfy_access_opened_at) }),
      };
    case "cancelled":
      return cancelled(row, now);
    case "lapsed":
      return holding(row);
  }
}

export function accessStateFromRow(
  row: SpineRow | null,
  now: Instant,
): AccessState {
  if (row === null) return Object.freeze({ state: "none" });
  const deposit = depositOf(row);
  const base = standing(row, now);
  return Object.freeze(deposit === undefined ? base : { ...base, deposit });
}
