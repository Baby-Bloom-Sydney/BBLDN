// One `consent_records` row → `ConsentRecord`, or `null` when the row cannot be read back as one. Since `0017`
// the row carries its own `purpose` (ADR-131 (2)), so a `vaccination-status` consent — or any informed action
// with no document — round-trips instead of being skipped; before it, such a row could not be attributed and
// `hasConsent` answered `false` for evidence that existed. The document pair is still optional, and `0017`'s
// CHECK is what guarantees `document_id` and `purpose` agree when both are present.
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
  const document =
    row.document_id === null || row.document_version === null
      ? null
      : Object.freeze({
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
    purpose: row.purpose,
    ...(document === null ? {} : { document }),
    consentGiven: row.consent_given,
    createdAt: row.created_at as Instant,
  });
}
