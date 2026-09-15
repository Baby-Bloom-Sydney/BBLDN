// 02 §3 — cluster "money". Values verbatim, add-only; tuple index = ordinal (02 C-1).
// guarantee_promise keeps `nanny-bonus` — reserved, unused day one (ADR-099; values are never removed).
export const MONEY_ENUMS = Object.freeze({
  subscription_status: Object.freeze([
    "trial",
    "active",
    "past_due",
    "cancelled",
    "paid_in_full",
    "lapsed",
    "placed",
  ] as const),
  plan_shape: Object.freeze(["upfront", "instalments"] as const), // ADR-068
  purchase_path: Object.freeze(["payment_link", "self_serve"] as const), // ADR-024
  cancellation_reason: Object.freeze([
    "too_expensive",
    "not_using",
    "service_issue",
    "circumstances_changed",
    "other",
  ] as const),
  subscribe_invite_status: Object.freeze([
    "pending",
    "redeemed",
    "expired",
    "revoked",
  ] as const),
  contact_category: Object.freeze([
    "refund",
    "billing",
    "technical",
    "general",
  ] as const),
  contact_message_status: Object.freeze([
    "unread",
    "replied",
    "closed",
    "spam",
  ] as const),
  refund_reason: Object.freeze([
    "cooling_off",
    "service_issue",
    "goodwill",
    "duplicate_charge",
    "other",
    "guarantee",
  ] as const),
  refund_status: Object.freeze(["open", "refunded", "denied"] as const),
  payment_link_kind: Object.freeze([
    "deposit",
    "balance-after-week-1",
    "custom",
  ] as const), // ADR-085 / 094 / 097
  guarantee_promise: Object.freeze([
    "G1",
    "G2",
    "G3",
    "G4",
    "G5",
    "nanny-bonus",
  ] as const), // ADR-088; nanny-bonus reserved (ADR-099)
  guarantee_paid_to: Object.freeze(["nanny", "family"] as const),
});
