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
