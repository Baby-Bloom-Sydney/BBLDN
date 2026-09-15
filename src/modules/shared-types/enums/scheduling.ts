// 02 §3 — cluster "scheduling" (ADR-074). Values verbatim, add-only; tuple index = ordinal (02 C-1).
export const SCHEDULING_ENUMS = Object.freeze({
  booking_status: Object.freeze([
    "held",
    "booked",
    "rescheduled",
    "cancelled",
    "done",
    "no-answer",
  ] as const),
  booking_subject_type: Object.freeze(["position", "nanny"] as const),
  block_kind: Object.freeze(["open", "blocked"] as const),
  attention_reason: Object.freeze([
    "blocked-over",
    "displaced",
    "manual",
  ] as const),
  booking_cancel_reason: Object.freeze([
    "user-cancelled",
    "admin-cancelled",
    "position-closed",
    "duplicate",
    "displaced-no-slot",
    "other",
  ] as const),
});
