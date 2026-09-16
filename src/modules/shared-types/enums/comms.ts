// 02 §3 — cluster "comms". Values verbatim, add-only; tuple index = ordinal (02 C-1).
export const COMMS_ENUMS = Object.freeze({
  message_channel: Object.freeze(["email", "sms"] as const), // sms unbound day one (N-11)
  message_status: Object.freeze([
    "queued",
    "sent",
    "failed",
    "bounced",
    "cancelled",
    "dry_run",
    // Appended by the coordinator's ruling of 2026-09-16, with 02 §3 amended to match: a message
    // suppressed as a duplicate is a real outcome, and without its own value it is indistinguishable
    // from `cancelled`. Added now rather than later because an enum value is add-only (C-1) but
    // still costs a migration. `dry_run` stays snake_case — 02 owns the enums; 03 §8.1's `dry-run`
    // is the side being corrected.
    "deduped",
  ] as const),
  admin_notification_kind: Object.freeze([
    "call_due",
    "call_overdue",
    "commission_call_booked",
    "onboarding_call_due",
    "nanny_barred",
    "contact_message",
    "cron_failed",
    "lead_replied",
    "booking_blocked_over",
    "booking_displacement_failed",
    "payment_due",
    "usage_check_low",
  ] as const),
});
