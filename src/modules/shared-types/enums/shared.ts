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
  event_source: Object.freeze(["server", "client"] as const),
  event_actor_kind: Object.freeze([
    "user",
    "admin",
    "system",
    "visitor",
    "anonymous",
  ] as const),
});
