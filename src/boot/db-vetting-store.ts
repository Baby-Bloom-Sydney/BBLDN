// The `VettingSubmissionStore` of `vetting-providers` over `auth`'s data port (ADR-154): `upsert` is
// `submit_verification_evidence()` at **session** scope — the nanny submits her own evidence and the definer
// acts for `auth.uid()`; the three ledger reads run at **service** scope, because `vetting_submissions` is
// service-role only (02 §4.3 row 2) and the wizard's processing step and the queue both read it — named in the
// module README (07 §5.1 rule 5). `recordDecision` is the admin road `2c` builds and refuses by name until then.
import type { DataAccessPort } from "@/modules/auth";
import { VETTING } from "@/modules/config";
import { nowInstant, ok } from "@/modules/platform";
import { requiredSectionsByLevel } from "@/modules/verification";
import type {
  CheckResult,
  CheckStatus,
  Evidence,
  EvidenceType,
  Instant,
  Result,
  Submission,
  SubmissionId,
  UserId,
} from "@/modules/shared-types";
import type {
  LedgerSection,
  VettingErrorDetails,
  VettingLedgerEntry,
  VettingSubmissionInput,
  VettingSubmissionStore,
} from "@/modules/vetting-providers";
import { sectionOfEvidenceType } from "@/modules/vetting-providers";

const session = { scope: "session" as const };
const service = { scope: "service" as const };

const asVetting = <T>(result: Result<T>): Result<T, VettingErrorDetails> =>
  result as Result<T, VettingErrorDetails>;

type LedgerRow = {
  readonly id: string;
  readonly nanny_id: string;
  readonly evidence_id: string;
  readonly section: LedgerSection;
  readonly evidence_type: string;
  readonly provider_key: string;
  readonly provider_ref: string | null;
  readonly status:
    | "pending"
    | "processing"
    | "needs_admin"
    | "passed"
    | "failed";
  readonly raw_response: {
    reject_reason?: string;
    guidance_key?: string;
    note?: string;
  } | null;
  readonly submitted_at: string;
  readonly checked_at: string | null;
};

const LEDGER_STATUS: Readonly<
  Record<CheckStatus["kind"], LedgerRow["status"]>
> = Object.freeze({
  pending: "pending",
  "needs-admin": "needs_admin",
  verified: "passed",
  rejected: "failed",
});

const checkStatusOf = (row: LedgerRow): CheckStatus => {
  switch (row.status) {
    case "passed":
      return {
        kind: "verified",
        at: (row.checked_at ?? row.submitted_at) as Instant,
      };
    case "failed": {
      // REVIEW-3 M-8: a rejected section always carries a copy key — the recorded key, else the reason itself
      // (SectionCard maps a reason to its line), never an empty string a screen would render as nothing
      const reason = row.raw_response?.reject_reason ?? "mismatch";
      return {
        kind: "rejected",
        reason: reason as never,
        guidanceKey: (row.raw_response?.guidance_key || reason) as never,
      };
    }
    case "needs_admin":
      return { kind: "needs-admin" };
    default:
      return { kind: "pending" };
  }
};

const entryOf = (row: LedgerRow): VettingLedgerEntry => ({
  submissionId: row.id as SubmissionId,
  evidenceId: row.evidence_id as Evidence["id"],
  provider: row.provider_key,
  status: checkStatusOf(row),
  ...(row.provider_ref === null ? {} : { providerRef: row.provider_ref }),
  nannyId: row.nanny_id as UserId,
  section: row.section,
  evidenceType: row.evidence_type as EvidenceType,
  submittedAt: row.submitted_at as Instant,
  ...(row.checked_at === null ? {} : { checkedAt: row.checked_at as Instant }),
  ...(row.raw_response?.note === undefined
    ? {}
    : { note: row.raw_response.note }),
});

/** Evidence → the section's submission columns `0022` admits (ADR-154 (2)); a key outside the list is dropped there. */
function columnsOf(evidence: Evidence): Record<string, unknown> {
  const ref = evidence.documents[0]?.path;
  const d = evidence.declared;
  switch (evidence.type) {
    case "identity-document":
      return {
        identity_evidence_type: d.idType,
        identity_document_ref: ref,
        surname: d.surname,
        given_names: d.givenNames,
        date_of_birth: d.dateOfBirth,
        biometric_consent_id: evidence.consent.biometric,
      };
    case "selfie":
      return {
        identity_selfie_ref: ref,
        biometric_consent_id: evidence.consent.biometric,
      };
    case "dbs-certificate":
      return {
        dbs_certificate_ref: ref,
        dbs_certificate_number: d.certificateNumber,
        dbs_issue_date: d.issueDate,
        // REVIEW-3 M-5: the key's PRESENCE is the consent; the instant is the server's (0023 stamps now())
        ...(d.updateServiceConsent === "true"
          ? { dbs_update_service_consent_at: true }
          : {}),
      };
    // REVIEW-3 L-4: the Update Service consent submitted as evidence of its own (03 §4.2's type) — the same
    // marker, never a silent `{}`
    case "dbs-update-service":
      return { dbs_update_service_consent_at: true };
    case "right-to-work-passport":
    case "right-to-work-document":
      return { rtw_evidence_type: d.kind, rtw_document_ref: ref };
    case "right-to-work-share-code":
      return { rtw_evidence_type: d.kind, rtw_share_code: d.shareCode };
    default: {
      const never: never = evidence.type;
      throw new Error(`columnsOf: unmapped evidence type ${String(never)}`);
    }
  }
}

/** ADR-157 (1): the sync's `p_required` — `VETTING.requiredChecksByLevel` as sections, computed once at boot. */
const REQUIRED = requiredSectionsByLevel(VETTING.requiredChecksByLevel);

export function dbVettingStore(port: DataAccessPort): VettingSubmissionStore {
  const readRows = async (
    name: `vetting-providers.${string}`,
    where: {
      readonly column: "id" | "evidence_id" | "nanny_id";
      readonly value: string;
    } | null,
  ): Promise<Result<ReadonlyArray<LedgerRow>, VettingErrorDetails>> =>
    asVetting(
      await port.run<ReadonlyArray<LedgerRow>>(
        {
          name,
          exec: async (q) => {
            const handle = q.from("vetting_submissions");
            const rows =
              where === null
                ? await handle.select()
                : await handle.eq(where.column, where.value).select();
            return rows as unknown as ReadonlyArray<LedgerRow>;
          },
        },
        service,
      ),
    );

  const store: VettingSubmissionStore = {
    upsert: async (input: VettingSubmissionInput) =>
      asVetting(
        await port.run<Submission>(
          {
            name: "vetting-providers.submit",
            exec: async (q) => {
              const out = (await q.rpc("submit_verification_evidence", {
                p_evidence_id: input.evidence.id,
                p_section: sectionOfEvidenceType(input.evidence.type),
                p_evidence_type: input.evidence.type,
                p_provider_key: input.provider,
                p_status: LEDGER_STATUS[input.status.kind],
                p_columns: columnsOf(input.evidence) as never,
              })) as { readonly submission_id: string };
              return {
                submissionId: out.submission_id as SubmissionId,
                evidenceId: input.evidence.id,
                provider: input.provider,
                status: input.status,
                ...(input.providerRef === undefined
                  ? {}
                  : { providerRef: input.providerRef }),
              };
            },
          },
          session,
        ),
      ),
    findByEvidence: async (evidenceId) => {
      const rows = await readRows("vetting-providers.findByEvidence", {
        column: "evidence_id",
        value: evidenceId,
      });
      if (!rows.ok) return rows;
      const row = rows.value[0];
      return ok(row === undefined ? null : entryOf(row));
    },
    read: async (submissionId) => {
      const rows = await readRows("vetting-providers.read", {
        column: "id",
        value: submissionId,
      });
      if (!rows.ok) return rows;
      const row = rows.value[0];
      return ok(row === undefined ? null : entryOf(row));
    },
    list: async (filter) => {
      const rows = await readRows(
        "vetting-providers.list",
        filter.nannyId === undefined
          ? null
          : { column: "nanny_id", value: filter.nannyId },
      );
      if (!rows.ok) return rows;
      return ok(
        rows.value
          .map(entryOf)
          .filter(
            (entry) =>
              (filter.section === undefined ||
                entry.section === filter.section) &&
              (filter.status === undefined ||
                entry.status.kind === filter.status),
          ),
      );
    },
    // ADR-157 (2) / ADR-159: the admin decision in one transaction — `record_vetting_decision()` at service
    // scope (named in the module README, 07 §5.1 rule 5): the ledger + the section through
    // `apply_vetting_check_result(…, 'admin')`, the note, for DBS the outcome and the cross-check, then the sync.
    // The actor's authority was checked by the action (`auth.requireRole`) before this adapter was reached; the
    // definer never sees an admin id for the decision itself — the event carries it (03 §9.3).
    recordDecision: async (input) =>
      asVetting(
        await port.run<CheckResult>(
          {
            name: "vetting-providers.recordDecision",
            exec: async (q) => {
              await q.rpc("record_vetting_decision", {
                p_submission_id: input.submissionId,
                p_decision: input.decision,
                p_reject_reason: input.reason,
                p_note: input.note,
                p_expires_at: input.expiresAt,
                p_required: REQUIRED as never,
              });
              const status: CheckStatus =
                input.decision === "verified"
                  ? {
                      kind: "verified",
                      at: nowInstant(),
                      ...(input.expiresAt === undefined
                        ? {}
                        : { expiresAt: input.expiresAt }),
                    }
                  : {
                      kind: "rejected",
                      reason: input.reason ?? "mismatch",
                      guidanceKey: (input.reason ?? "mismatch") as never,
                    };
              return {
                submissionId: input.submissionId,
                status,
                checkedAt: nowInstant(),
              };
            },
          },
          service,
        ),
      ),
  };
  return Object.freeze(store);
}
