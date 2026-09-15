// 02 §3 — cluster "app (Katie)". Values verbatim, add-only; tuple index = ordinal (02 C-1).
export const KATIE_ENUMS = Object.freeze({
  chat_role: Object.freeze(["user", "assistant", "system", "tool"] as const),
  chat_trigger_source: Object.freeze([
    "user",
    "assistant_reply",
    "proactive_module",
    "proactive_scheduled",
    "proactive_template",
    "proactive_manual",
  ] as const),
  summary_period: Object.freeze(["daily", "weekly", "monthly"] as const),
  memory_scope: Object.freeze(["account", "child", "shared"] as const),
  memory_priority: Object.freeze(["high", "medium", "low"] as const),
  schedule_created_by: Object.freeze(["module", "katie", "admin"] as const),
  schedule_mode: Object.freeze(["template", "ai-minimal", "ai-full"] as const),
  prompt_edit_status: Object.freeze(["applied", "rolled_back"] as const),
  proposal_kind: Object.freeze([
    "module_change",
    "schema_change",
    "prompt_change",
    "other",
  ] as const),
  proposal_status: Object.freeze([
    "open",
    "accepted",
    "rejected",
    "implemented",
  ] as const),
});
