// One `consent_records` row → `ConsentRecord`, or `null` when the row cannot be read back as one. **The table has
// no `purpose` column** (02 §4.1 row 5 stores the document pair, the agreement and the checkpoint), so a row's
// purpose is recoverable only from `document_id`; a row written for `vaccination-status` (ADR-103) or an informed
// action with no document has `null` there and cannot be attributed to any purpose on the way back — such a row
// is skipped, so `hasConsent` answers `false` for it (fail closed). Recorded as a foundations gap for the 02
// owner in the L-007 P1-WIRE entry: the column exists in the connector's `ConsentRecord`, not in the row.
import type { AppDatabase } from "@/modules/auth";
import type {
  ConsentContext,
  ConsentRecord,
  LegalDocumentId,
} from "@/modules/platform";
import type {
  ConsentRecordId,
  Instant,
  UserId,
  Uuid,
} from "@/modules/shared-types";

type ConsentRow = AppDatabase["Tables"]["consent_records"]["Row"];

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

function contextOf(row: ConsentRow): ConsentContext {
  return Object.freeze({
    ...(asString(row.ip_address) === undefined
      ? {}
      : { ipAddress: asString(row.ip_address) }),
    ...(row.user_agent === null ? {} : { userAgent: row.user_agent }),
    ...(row.session_id === null ? {} : { sessionId: row.session_id }),
  });
}

export function consentRecordFromRow(row: ConsentRow): ConsentRecord | null {
  if (row.party === "admin") return null; // the table's CHECK forbids it; a row that has it is not a consent
  if (row.document_id === null || row.document_version === null) return null;
  const document = Object.freeze({
    id: row.document_id as LegalDocumentId,
    version: row.document_version,
  });
  return Object.freeze({
    id: row.id as ConsentRecordId,
    userId: row.user_id as UserId,
    party: row.party,
    agreementId: row.agreement_id as ConsentRecord["agreementId"],
    checkpointId: row.checkpoint_id,
    checkpointText: row.checkpoint_text,
    context: contextOf(row),
    ...(row.related_entity_id === null
      ? {}
      : { relatedEntityId: row.related_entity_id as Uuid }),
    purpose: document.id,
    document,
    consentGiven: row.consent_given,
    createdAt: row.created_at as Instant,
  });
}
