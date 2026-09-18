// The reveal (07 §4.32; ADR-159): the objects of one submission's section, signed for `SECURITY.signedUrlTtlSeconds
// .verification` through the one minter (07 §5.3 rule 1), and the declared S4 fields of that section — each open
// emits `vetting.evidence-viewed` naming the admin, so a mass of reveals is visible in the event log (07 §9.2 (f)).
import { auth } from "@/modules/auth";
import { SECURITY } from "@/modules/config";
import { err, ok } from "@/modules/platform";
import type { Result, SubmissionId, Url } from "@/modules/shared-types";
import { readSubmission } from "@/modules/vetting-providers";
import type {
  DeclaredFields,
  EvidenceOpen,
  EvidenceObjectSection,
  VerificationDeps,
  VerificationErrorDetails,
  VerificationSection,
} from "../types";
import { consumeAdminRouteLimit } from "./consume-admin-route-limit";
import { emitVerificationEvent } from "./emit-verification-event";
import { requireAdmin } from "./require-admin";
import { sectionOfLedger } from "./section-of-ledger";

const OBJECTS_OF: Readonly<
  Record<VerificationSection, ReadonlyArray<EvidenceObjectSection>>
> = Object.freeze({
  identity: ["identity-document", "identity-selfie"],
  dbs: ["dbs-certificate"],
  "right-to-work": ["rtw-document"],
});

/** Only the fields that belong to the opened section leave the record (data minimisation, 07 §3). */
function declaredFor(
  section: VerificationSection,
  declared: DeclaredFields,
): DeclaredFields {
  switch (section) {
    case "identity":
      return {
        ...(declared.surname === undefined
          ? {}
          : { surname: declared.surname }),
        ...(declared.givenNames === undefined
          ? {}
          : { givenNames: declared.givenNames }),
        ...(declared.dateOfBirth === undefined
          ? {}
          : { dateOfBirth: declared.dateOfBirth }),
        ...(declared.idType === undefined ? {} : { idType: declared.idType }),
      };
    case "dbs":
      return {
        ...(declared.surname === undefined
          ? {}
          : { surname: declared.surname }),
        ...(declared.certificateNumber === undefined
          ? {}
          : { certificateNumber: declared.certificateNumber }),
        ...(declared.issueDate === undefined
          ? {}
          : { issueDate: declared.issueDate }),
      };
    default:
      return {
        ...(declared.rtwKind === undefined
          ? {}
          : { rtwKind: declared.rtwKind }),
        ...(declared.shareCode === undefined
          ? {}
          : { shareCode: declared.shareCode }),
        ...(declared.dateOfBirth === undefined
          ? {}
          : { dateOfBirth: declared.dateOfBirth }),
      };
  }
}

export async function openEvidence(
  deps: VerificationDeps,
  submissionId: SubmissionId,
): Promise<Result<EvidenceOpen, VerificationErrorDetails>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const limited = await consumeAdminRouteLimit(admin.value);
  if (!limited.ok) return limited;
  const entry = await readSubmission(submissionId);
  if (!entry.ok) return entry as Result<never, VerificationErrorDetails>;
  const section =
    entry.value === null ? null : sectionOfLedger(entry.value.section);
  if (entry.value === null || section === null)
    return err("VALIDATION", "That check is not available", {
      reason: "unsupported-evidence",
    });
  const record = await deps.store.readAdminRecord(entry.value.nannyId);
  if (!record.ok) return record;
  if (record.value === null)
    return err("VALIDATION", "That check is not available", {
      reason: "unsupported-evidence",
    });

  const ttl = SECURITY.signedUrlTtlSeconds.verification;
  const wanted = new Set<string>(OBJECTS_OF[section]);
  const documents: Array<EvidenceOpen["documents"][number]> = [];
  for (const doc of record.value.documents) {
    if (!wanted.has(doc.section)) continue;
    const signed = await auth.data.signUrl(doc.ref, ttl);
    if (!signed.ok)
      return err("INTERNAL", "That file could not be opened.", {
        reason: "storage_failure",
      });
    documents.push({
      section: doc.section,
      url: signed.value as Url,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString() as never,
    });
  }

  await emitVerificationEvent({
    name: "vetting.evidence-viewed",
    actor: {
      kind: "admin",
      id: admin.value.adminId,
      // ★ ADR-169 — `Actor.onBehalfOf.id` is an `auth.users.id` (03 §9.2), and the ledger hands this road a
      // `nannies.id`. The record read above already crossed the seam once, so the audit subject is the id the
      // audit log is keyed by rather than the one that happened to be in scope.
      onBehalfOf: { role: "nanny", id: record.value.userId },
    },
    props: {
      submissionId,
      evidenceType: entry.value.evidenceType,
      viewerAdminId: admin.value.userId,
    },
  });

  return ok({
    documents,
    declared: declaredFor(section, record.value.declared),
  });
}
