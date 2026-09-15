// 02 §3 — cluster "app" (children, linking, development records). Values verbatim, add-only; index = ordinal.
export const APP_ENUMS = Object.freeze({
  child_status: Object.freeze(["setup", "active", "closed"] as const),
  link_source: Object.freeze(["invite", "placement", "manual"] as const),
  link_state: Object.freeze(["active", "ended"] as const),
  invite_direction: Object.freeze([
    "nanny_to_parent",
    "parent_to_nanny",
  ] as const),
  invite_status: Object.freeze(["pending", "connected", "revoked"] as const),
  invite_revoked_reason: Object.freeze(["manual", "child_deleted"] as const), // no `regenerated`
  dev_domain: Object.freeze([
    "CL",
    "PSE",
    "PD",
    "LIT",
    "NUM",
    "UW",
    "EAD",
  ] as const),
  age_bracket: Object.freeze([
    "0-3",
    "3-6",
    "6-12",
    "12-18",
    "18-24",
    "24-32",
  ] as const),
  post_type: Object.freeze([
    "observation",
    "activity",
    "report",
    "progress",
    "diary",
    "insight",
    "custom",
  ] as const),
  post_context: Object.freeze(["adhoc", "activity", "assessment"] as const),
  post_status: Object.freeze(["pending", "ready", "completed"] as const),
  post_source: Object.freeze(["manual", "katie", "system"] as const),
});
