// `ConsentRecord` (platform/consent) → one `consent_records` row (02 §4.1 row 5; `0004`). Pure. The document
// pair travels together or not at all (the table's CHECK); `vaccination-status` (ADR-103) and an informed action
// without a document write `null` for both — see `consent-record-from-row.ts` for what that costs on the way back.
import type { AppDatabase } from "@/modules/auth";
import type { ConsentRecord } from "@/modules/platform";

export type ConsentInsertRow =
  AppDatabase["Tables"]["consent_records"]["Insert"];

export function consentInsertRow(record: ConsentRecord): ConsentInsertRow {
  return Object.freeze({
    id: record.id,
    user_id: record.userId,
    party: record.party,
    agreement_id: record.agreementId,
    checkpoint_id: record.checkpointId,
    checkpoint_text: record.checkpointText,
    document_id: record.document?.id ?? null,
    document_version: record.document?.version ?? null,
    consent_given: record.consentGiven,
    ip_address: record.context.ipAddress ?? null,
    user_agent: record.context.userAgent ?? null,
    session_id: record.context.sessionId ?? null,
    related_entity_id: record.relatedEntityId ?? null,
    created_at: record.createdAt,
  });
}
