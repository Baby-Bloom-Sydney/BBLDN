// S-N-05 (03 §4.3 "`submitIdentity` (`identity-document` + `selfie`)"): the consent gate first (07 §2.6; I-V3 —
// nothing is uploaded without the AGR-04 row), the section must be open, the per-section limit is consumed,
// the two objects are written, the two evidences submitted (one attempt), and a failure after the uploads
// removes them.
import { VETTING } from "@/modules/config";
import { consent, err, newId, nowInstant } from "@/modules/platform";
import type {
  Evidence,
  EvidenceId,
  Result,
  UserId,
} from "@/modules/shared-types";
import type {
  IdentityInput,
  SectionState,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";
import { assertSectionOpen } from "./assert-section-open";
import { consumeVerificationSubmitLimit } from "./consume-verification-submit-limit";
import { removeEvidenceObjects } from "./remove-evidence-objects";
import { requireOwnNanny } from "./require-own-nanny";
import { sectionStateOf } from "./section-state-of";
import { signEvidence } from "./sign-evidence";
import { submitEvidence } from "./submit-evidence";
import { uploadEvidence } from "./upload-evidence";

export async function submitIdentity(
  deps: VerificationDeps,
  nannyId: UserId,
  input: IdentityInput,
): Promise<Result<SectionState, VerificationErrorDetails>> {
  const own = await requireOwnNanny(nannyId);
  if (!own.ok) return own;
  const consented = await consent.hasConsent(nannyId, "biometric-notice");
  if (!consented.ok || !consented.value)
    return err("VALIDATION", "Please read the notice and tick the box first.", {
      reason: "consent-required",
    });
  if (
    !(VETTING.identityEvidence as ReadonlyArray<string>).includes(input.idType)
  )
    return err("VALIDATION", "Pick one of the listed documents.", {
      reason: "unsupported-evidence",
      field: "idType",
    });
  const before = await deps.store.getStatus(nannyId);
  if (!before.ok) return before;
  const open = assertSectionOpen(sectionStateOf(before.value, "identity"));
  if (!open.ok) return open;
  const limit = await consumeVerificationSubmitLimit(nannyId, "identity");
  if (!limit.ok) return limit;

  const document = await uploadEvidence(
    nannyId,
    "identity-document",
    input.document,
  );
  if (!document.ok)
    return {
      ...document,
      error: {
        ...document.error,
        details: { ...document.error.details!, field: "document" },
      },
    };
  const selfie = await uploadEvidence(nannyId, "identity-selfie", input.selfie);
  if (!selfie.ok) {
    await removeEvidenceObjects([document.value]);
    return {
      ...selfie,
      error: {
        ...selfie.error,
        details: { ...selfie.error.details!, field: "selfie" },
      },
    };
  }
  const uploaded = [document.value, selfie.value];
  const [documentRef, selfieRef] = await Promise.all(
    uploaded.map(signEvidence),
  );
  if (!documentRef!.ok || !selfieRef!.ok) {
    await removeEvidenceObjects(uploaded);
    return err(
      "INTERNAL",
      "We couldn't save that just now. Try again in a moment.",
      { reason: "storage_failure" },
    );
  }
  const submittedAt = nowInstant();
  const shared = {
    nannyId,
    consent: { biometric: input.consentRecordId },
    submittedAt,
  };
  const evidences: ReadonlyArray<Evidence> = [
    {
      ...shared,
      id: newId<EvidenceId>(),
      type: "identity-document",
      documents: [documentRef!.value],
      declared: {
        idType: input.idType,
        surname: input.surname,
        givenNames: input.givenNames,
        dateOfBirth: input.dateOfBirth,
      },
    },
    {
      ...shared,
      id: newId<EvidenceId>(),
      type: "selfie",
      documents: [selfieRef!.value],
      declared: {},
    },
  ];
  return submitEvidence(
    deps.store,
    nannyId,
    "identity",
    evidences,
    uploaded,
    removeEvidenceObjects,
  );
}
