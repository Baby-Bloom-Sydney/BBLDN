// `BiometricConsentRecord` (platform/consent) → one `biometric_consent_records` row (02 §4.1 row 6; `0004`).
// Pure. `notice_document_id` is a generated column (always `biometric-notice`) and is not written.
import type { AppDatabase } from "@/modules/auth";
import type { BiometricConsentRecord } from "@/modules/platform";
import type { Json } from "@/modules/shared-types";

export type BiometricInsertRow =
  AppDatabase["Tables"]["biometric_consent_records"]["Insert"];

export function biometricInsertRow(
  record: BiometricConsentRecord,
): BiometricInsertRow {
  return Object.freeze({
    id: record.id,
    user_id: record.userId,
    notice_version: record.noticeVersion,
    notice_content_hash: record.noticeContentHash,
    notice_opened_at: record.noticeOpenedAt,
    notice_scroll_completed_at: record.noticeScrollCompletedAt,
    checkboxes_enabled_at: record.checkboxesEnabledAt,
    notice_time_spent_seconds: record.noticeTimeSpentSeconds,
    checkbox_timestamps: { ...record.checkboxTimestamps } as Json,
    ai_provider_disclosed: record.aiProviderDisclosed,
    processing_location_disclosed: record.processingLocationDisclosed,
    created_at: record.createdAt,
  });
}
