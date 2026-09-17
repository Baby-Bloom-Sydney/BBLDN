// 02 §3 — cluster "shared". Values verbatim, add-only; tuple index = ordinal (02 C-1).
export const SHARED_ENUMS = Object.freeze({
  user_role: Object.freeze(["parent", "nanny", "admin"] as const), // no super_admin day one (R-12)
  mover: Object.freeze(["user", "admin", "system"] as const),
  actor_role: Object.freeze(["parent", "nanny", "admin", "system"] as const),
  cookie_choice: Object.freeze([
    "accept_all",
    "reject_non_essential",
    "custom",
  ] as const),
  // ADR-131 (2) / 07 §2.7(a) — what a `consent_records` row is *for*: the eleven `legal_documents`
  // day-one slugs in 02 §4.1's order, then the three non-document purposes. `0017` holds the same
  // fourteen in the same order; `enum-ordinals.test.ts` is what keeps them one register.
  consent_purpose: Object.freeze([
    "client-tos",
    "professional-tos",
    "privacy-policy",
    "biometric-notice",
    "code-of-conduct",
    "cookie-policy",
    "disclaimer",
    "parent-app-consent",
    "nanny-attestation",
    "media-consent",
    "agr14_nanny_child_add",
    "vaccination-status",
    "marketing",
    "cookie",
  ] as const),
  event_source: Object.freeze(["server", "client"] as const),
  event_actor_kind: Object.freeze([
    "user",
    "admin",
    "system",
    "visitor",
    "anonymous",
  ] as const),
});
