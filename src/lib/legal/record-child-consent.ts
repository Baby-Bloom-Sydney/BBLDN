// **Bundled per-child consent** (FATE `10.16`; L-009 `3g`). `3c` found the purposes and the documents in place
// and no recorder to write the row; this is the recorder.
//
// *Bundled* is the product shape BAI settled and the fate table carries: **one consent per party per child**,
// covering the whole of what that party is agreeing to for that child, rather than a consent per activity. So
// there are exactly two agreements here — the parent's (`AGR-15`, `parent-app-consent`) and the nanny's
// (`AGR-16`, `nanny-attestation`) — each written against its own document's current triple, each scoped to the
// child by `related_entity_id`.
//
// **What this file is not.** It is not the surface. Where the tick lives, whether it is pre-ticked (it is not —
// ADR-175's reasoning is not confined to cookies), and what happens on a decline are `3b`'s and F-d's, and
// nothing here assumes them. It is not a gate either: `media-consent-gate.ts` decides whether a *write is
// allowed*, and reads the rows this writes.
//
// **A decline is a row.** `consentGiven: false` writes a new row rather than deleting or updating the old one:
// the table is append-only, the gate reads the newest row, and the withdrawal is evidence in its own right
// (Art 7(3) and Art 7(1) pull the same way here).
//
// **The document bodies are drafts.** `0026` seeded all eleven DRAFT-marked, and this recorder binds to
// whatever version is current — so when `3a`'s ratified text lands as version 2, every consent taken from that
// moment names the new words and every consent already taken still resolves to the old ones. Nothing in this
// file changes on that day, which is the whole point of pointing it at the registry.
import { err } from "@/modules/platform";
import type { ConsentContext } from "@/modules/platform";
import type { Result, UserId, Uuid } from "@/modules/shared-types";
import { purposeForAgreement } from "./purpose-for-agreement";
import { recordDocumentConsent } from "./record-document-consent";
import type { AgreementId } from "./types";

/** The two bundled agreements, and the party each belongs to — a nanny cannot consent as a parent. */
const BUNDLED = Object.freeze({
  "PARENT-APP-CONSENT": { party: "parent" },
  "NANNY-ATTESTATION": { party: "nanny" },
} as const);

export type ChildConsentInput = {
  readonly userId: UserId;
  readonly childId: Uuid;
  readonly agreementId: Extract<
    AgreementId,
    "PARENT-APP-CONSENT" | "NANNY-ATTESTATION"
  >;
  readonly checkpointId: string;
  /** Kept verbatim: the evidence has to read as the words she was actually shown (02 §4.1). */
  readonly checkpointText: string;
  readonly consentGiven: boolean;
  readonly context?: ConsentContext;
};

export async function recordChildConsent(
  input: ChildConsentInput,
): Promise<Result<void>> {
  const target = purposeForAgreement(input.agreementId);
  if (target === null)
    return err("INTERNAL", "We couldn't record your agreement.", {
      reason: "unknown-purpose",
    });

  return await recordDocumentConsent({
    userId: input.userId,
    party: BUNDLED[input.agreementId].party,
    agreementId: target.agreementId,
    purpose: target.purpose,
    checkpointId: input.checkpointId,
    checkpointText: input.checkpointText,
    consentGiven: input.consentGiven,
    relatedEntityId: input.childId,
    ...(input.context === undefined ? {} : { context: input.context }),
  });
}
