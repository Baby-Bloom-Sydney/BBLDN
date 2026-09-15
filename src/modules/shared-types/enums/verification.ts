// 02 §3 — cluster "verification". Values verbatim, add-only; tuple index = ordinal (02 C-1).
export const VERIFICATION_ENUMS = Object.freeze({
  verification_level: Object.freeze([
    "L0_SIGNED_UP",
    "L1_REGISTERED",
    "L2_ID_VERIFIED",
    "L3_PROVISIONALLY_VERIFIED",
    "L4_FULLY_VERIFIED",
  ] as const), // 05.22 names, 0–4 order
  section_status: Object.freeze([
    "not_started",
    "pending",
    "processing",
    "verified",
    "review",
    "rejected",
    "failed",
    "expired",
  ] as const),
  dbs_outcome: Object.freeze([
    "unset",
    "cleared",
    "adverse",
    "barred",
  ] as const),
  update_service_result: Object.freeze([
    "not_subscribed",
    "no_change",
    "new_information",
    "check_failed",
  ] as const),
  identity_evidence_type: Object.freeze([
    "passport",
    "uk_driving_licence",
    "evisa_share_code",
  ] as const), // accepted list is config (config/vetting.ts)
  rtw_evidence_type: Object.freeze([
    "british_irish_passport",
    "share_code",
    "immigration_document",
  ] as const),
  checked_by: Object.freeze(["ai", "admin", "none"] as const),
  cross_check_status: Object.freeze([
    "not_started",
    "pending",
    "passed",
    "review",
  ] as const),
  verification_section: Object.freeze([
    "identity",
    "dbs",
    "right_to_work",
    "contact",
    "cross_check",
    "overall",
  ] as const),
  vetting_submission_status: Object.freeze([
    "pending",
    "processing",
    "needs_admin",
    "passed",
    "failed",
  ] as const), // provisional
});
