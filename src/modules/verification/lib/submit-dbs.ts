// S-N-06 (03 §4.3 "`submitDbs` (`dbs-certificate` [+ Update Service consent])"; kickoff §4.3 default — the
// certificate is uploaded, the number and issue date typed, and the Update Service consent stamped). One
// evidence, one object.
import { err, newId, nowInstant } from "@/modules/platform";
import type {
  Evidence,
  EvidenceId,
  Result,
  UserId,
} from "@/modules/shared-types";
import type {
  DbsInput,
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

export async function submitDbs(
  deps: VerificationDeps,
  nannyId: UserId,
  input: DbsInput,
): Promise<Result<SectionState, VerificationErrorDetails>> {
  const own = await requireOwnNanny(nannyId);
  if (!own.ok) return own;
  if (!input.updateServiceConsent)
    return err("VALIDATION", "Please tick the Update Service box.", {
      reason: "consent-required",
      field: "updateServiceConsent",
    });
  const before = await deps.store.getStatus(nannyId);
  if (!before.ok) return before;
  const open = assertSectionOpen(sectionStateOf(before.value, "dbs"));
  if (!open.ok) return open;
  const limit = await consumeVerificationSubmitLimit(nannyId, "dbs");
  if (!limit.ok) return limit;
  const certificate = await uploadEvidence(
    nannyId,
    "dbs-certificate",
    input.certificate,
  );
  if (!certificate.ok) return certificate;
  const signed = await signEvidence(certificate.value);
  if (!signed.ok) {
    await removeEvidenceObjects(nannyId, [certificate.value]);
    return signed;
  }
  const evidence: Evidence = {
    id: newId<EvidenceId>(),
    nannyId,
    type: "dbs-certificate",
    documents: [signed.value],
    declared: {
      certificateNumber: input.certificateNumber,
      issueDate: input.issueDate,
      updateServiceConsent: "true",
    },
    consent: {},
    submittedAt: nowInstant(),
  };
  return submitEvidence(
    deps.store,
    nannyId,
    "dbs",
    [evidence],
    [certificate.value],
    (refs) => removeEvidenceObjects(nannyId, refs),
  );
}
