// A spine row with every column at its schema default (02 §4.5 row 1) — what the in-memory store starts a family
// from, so a test row carries the same shape as a generated row. The one `status` a row can hold before any access
// exists is `lapsed`: `subscription_status` has no pre-trial value, and `start_family_trial_if_first` was written
// to let a `lapsed` row with `has_used_trial = false` take its first trial (0010 §8, database-reviewer M-7) —
// which is what makes `lapsed` the holding status a deposit lands on. Recorded in the L-007 1h entry.
import type { FamilyId, Instant } from "@/modules/shared-types";
import type { SpineRow } from "./spine-store";

export function blankSpineRow(familyId: FamilyId, now: Instant): SpineRow {
  return {
    id: crypto.randomUUID(),
    parent_user_id: familyId,
    status: "lapsed",
    plan_shape: null,
    purchase_path: null,
    purchased_at: null,
    instalments_total: null,
    instalments_paid: null,
    price_pence: null,
    price_version: null,
    access_until: null,
    placement_id: null,
    dfy_access_opened_at: null,
    payment_due_at: null,
    first_week_wages_pence: null,
    balance_pence: null,
    balance_link_ref: null,
    price_preset: null,
    deposit_pence: null,
    deposit_link_ref: null,
    deposit_paid_at: null,
    deposit_refunded_at: null,
    trial_started_at: null,
    trial_ends_at: null,
    has_used_trial: false,
    satisfaction_window_ends_at: null,
    access_toggled_on: null,
    access_toggled_at: null,
    access_toggled_by: null,
    access_toggle_reason: null,
    access_toggle_until: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_subscription_schedule_id: null,
    stripe_payment_intent_id: null,
    stripe_checkout_session_id: null,
    stripe_payment_link_id: null,
    current_period_ends_at: null,
    past_due_grace_ends_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    cancellation_text: null,
    trial_reminder_sent_at: null,
    access_end_reminder_sent_at: null,
    created_at: now,
    updated_at: now,
  };
}
