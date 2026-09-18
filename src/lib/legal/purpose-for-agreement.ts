// What an agreement label means to the connector: its London `AGR-nn` id and the document it is an acceptance
// of (L-009 `3g`).
//
// **Two problems in one table, because they are the same problem.**
//
// 1. *The document.* The Sydney map lived inside `record-consent.ts` as a `Partial<Record<…>>` returning `null`,
//    so an agreement nobody had mapped wrote a row with no document at all — a consent record that cannot say
//    what was consented to. It is total here: a new label is a compile error, not a silent `null`.
//
// 2. *The id.* Two of the labels are not `AGR-nn` at all. `PARENT-APP-CONSENT` and `NANNY-ATTESTATION` are
//    Sydney's names for the bundled per-child pair (FATE `10.16`), and 02 §4.1 says an `agreement_id` is
//    `AGR-nn` — which is also what `platform/consent`'s `AgreementId` type says, so the connector cannot be
//    handed the Sydney labels. They take the next two free numbers, **`AGR-15`** (parent) and **`AGR-16`**
//    (nanny). This costs nothing to adopt and is worth stating plainly: the London database has never held a
//    consent row, so there is no history under the old labels to migrate — the rename is free today and would
//    not be after launch.
//
// **AGR-03 has no document, and that is the correct state rather than a gap.** It is the *client* biometric
// notice, and ADR-071 makes biometric verification nanny-only — `0026` seeds `biometric-notice` (the
// professional's) and no client equivalent, because there is nothing for a parent to be shown. Mapping AGR-03
// onto the professional notice would record a parent accepting a document written for somebody else. It has no
// runtime caller; if one appears it fails here rather than writing that row.
import type { AgreementId as PlatformAgreementId } from "@/modules/platform";
import type { LegalDocumentId } from "@/modules/platform";
import type { AgreementId } from "./types";

export type AgreementTarget = {
  /** What goes in `consent_records.agreement_id` (02 §4.1). */
  readonly agreementId: PlatformAgreementId;
  readonly purpose: LegalDocumentId;
};

const TARGETS: Readonly<Record<AgreementId, AgreementTarget | null>> =
  Object.freeze({
    "AGR-01": { agreementId: "AGR-01", purpose: "client-tos" },
    "AGR-02": { agreementId: "AGR-02", purpose: "professional-tos" },
    "AGR-03": null, // client biometric notice — does not exist (ADR-071); see the header
    "AGR-04": { agreementId: "AGR-04", purpose: "biometric-notice" },
    "AGR-05": { agreementId: "AGR-05", purpose: "client-tos" },
    "AGR-06": { agreementId: "AGR-06", purpose: "client-tos" },
    "AGR-07": { agreementId: "AGR-07", purpose: "client-tos" },
    "AGR-08": { agreementId: "AGR-08", purpose: "professional-tos" },
    "AGR-09": { agreementId: "AGR-09", purpose: "professional-tos" },
    "AGR-10": { agreementId: "AGR-10", purpose: "client-tos" },
    "AGR-11": { agreementId: "AGR-11", purpose: "professional-tos" },
    "AGR-12": { agreementId: "AGR-12", purpose: "privacy-policy" },
    "AGR-13": { agreementId: "AGR-13", purpose: "cookie-policy" },
    "AGR-14": { agreementId: "AGR-14", purpose: "agr14_nanny_child_add" },
    "PARENT-APP-CONSENT": {
      agreementId: "AGR-15",
      purpose: "parent-app-consent",
    },
    "NANNY-ATTESTATION": {
      agreementId: "AGR-16",
      purpose: "nanny-attestation",
    },
  });

export function purposeForAgreement(
  agreementId: AgreementId,
): AgreementTarget | null {
  return TARGETS[agreementId];
}
