// One document consent, recorded through the connector with the **whole** triple (L-009 `3g`; ADR-173).
//
// **Why this exists at all, measured rather than assumed.** `record-consent.ts` wrote `consent_records` itself,
// with the admin client, naming `document_id` and `document_version` and nothing else. Since `0026` that row is
// refused by the database — driven against the applied stack on 2026-09-20:
//
//     insert … (document_id, document_version) values ('client-tos', 1)
//     → 23502  "consent_records.document_content_hash must name the content_hash of the version accepted"
//
// It also wrote a `user_type` column the London table does not have (it is `party`). So **every** legacy consent
// write — the signup clickwrap modal, the connection informed-actions, the per-child consents, the renewal and
// decline rows — was unwritable. Nothing noticed, because nothing exercised them against a stack with `0026`
// applied.
//
// The fix is not to add the hash at the call site: it is to stop having call sites that build the row. The
// connector already resolves the current version, checks the triple and lets `0026`'s composite key do the rest
// (`recordSignupConsent` is the pattern this follows). Every consent write in the tree now goes through here or
// through a module that does the same thing, so the day `3a`'s ratified text lands as version 2 there is
// nothing to update: the next row names the new triple because it asked.
import { consent, err, ok } from "@/modules/platform";
import type {
  AgreementId,
  ConsentContext,
  ConsentParty,
  LegalDocumentId,
} from "@/modules/platform";
import type { Result, UserId, Uuid } from "@/modules/shared-types";

export type DocumentConsentInput = {
  readonly userId: UserId;
  readonly party: ConsentParty;
  readonly agreementId: AgreementId;
  readonly purpose: LegalDocumentId;
  readonly checkpointId: string;
  readonly checkpointText: string;
  /** A decline is a new row with `false` (02 §4.1), never an absent one. */
  readonly consentGiven: boolean;
  /** The child a per-child consent is about (02 `related_entity_id`). */
  readonly relatedEntityId?: Uuid;
  readonly context?: ConsentContext;
};

export async function recordDocumentConsent(
  input: DocumentConsentInput,
): Promise<Result<void>> {
  const policy = await consent.getPolicy(input.purpose);
  if (!policy.ok) return policy;
  const document = policy.value.currentDocument;
  if (document === undefined)
    // `0026` seeds every day-one slug, so this is an outage rather than a user error: the document she is being
    // asked to accept does not exist, and recording a consent to nothing would be worse than refusing.
    return err("INTERNAL", "We couldn't record your agreement.", {
      reason: "document-required",
    });

  const recorded = await consent.recordConsent({
    userId: input.userId,
    party: input.party,
    agreementId: input.agreementId,
    checkpointId: input.checkpointId,
    checkpointText: input.checkpointText,
    context: input.context ?? {},
    purpose: input.purpose,
    // Ruling 5.1 — version AND hash, so the row names the exact words she was shown.
    document: {
      id: document.id,
      version: document.version,
      contentHash: document.contentHash,
    },
    consentGiven: input.consentGiven,
    ...(input.relatedEntityId === undefined
      ? {}
      : { relatedEntityId: input.relatedEntityId }),
  });
  return recorded.ok ? ok(undefined) : recorded;
}
