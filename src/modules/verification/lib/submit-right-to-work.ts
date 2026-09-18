// S-N-07 (03 §4.3 "`submitRightToWork` (one of three types)"; ADR-153): a British / Irish passport or an
// immigration document is one object; a share code is a submission with no object at all.
import { VETTING } from "@/modules/config";
import { newId, nowInstant, ok } from "@/modules/platform";
import type {
  DocumentRef,
  Evidence,
  EvidenceId,
  Result,
  UserId,
} from "@/modules/shared-types";
import type {
  EvidenceRef,
  RightToWorkInput,
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

type Prepared = {
  readonly documents: ReadonlyArray<DocumentRef>;
  readonly uploaded: ReadonlyArray<EvidenceRef>;
};

async function prepareDocument(
  nannyId: UserId,
  input: RightToWorkInput,
): Promise<Result<Prepared, VerificationErrorDetails>> {
  if (input.kind === "share_code") return ok({ documents: [], uploaded: [] });
  const uploaded = await uploadEvidence(
    nannyId,
    "rtw-document",
    input.document,
  );
  if (!uploaded.ok) return uploaded;
  const signed = await signEvidence(uploaded.value);
  if (!signed.ok) {
    await removeEvidenceObjects([uploaded.value]);
    return signed;
  }
  return ok({ documents: [signed.value], uploaded: [uploaded.value] });
}

const declaredOf = (
  input: RightToWorkInput,
): Readonly<Record<string, string>> =>
  input.kind === "share_code"
    ? {
        kind: input.kind,
        shareCode: input.shareCode,
        dateOfBirth: input.dateOfBirth,
      }
    : { kind: input.kind };

export async function submitRightToWork(
  deps: VerificationDeps,
  nannyId: UserId,
  input: RightToWorkInput,
): Promise<Result<SectionState, VerificationErrorDetails>> {
  const own = await requireOwnNanny(nannyId);
  if (!own.ok) return own;
  const before = await deps.store.getStatus(nannyId);
  if (!before.ok) return before;
  const open = assertSectionOpen(sectionStateOf(before.value, "right-to-work"));
  if (!open.ok) return open;
  const limit = await consumeVerificationSubmitLimit(nannyId, "right-to-work");
  if (!limit.ok) return limit;
  const prepared = await prepareDocument(nannyId, input);
  if (!prepared.ok) return prepared;
  const evidence: Evidence = {
    id: newId<EvidenceId>(),
    nannyId,
    type: VETTING.rightToWorkEvidence[input.kind],
    documents: prepared.value.documents,
    declared: declaredOf(input),
    consent: {},
    submittedAt: nowInstant(),
  };
  return submitEvidence(
    deps.store,
    nannyId,
    "right-to-work",
    [evidence],
    prepared.value.uploaded,
    removeEvidenceObjects,
  );
}
