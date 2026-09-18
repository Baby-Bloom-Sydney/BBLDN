// The `VerificationStore` of `verification` over `auth`'s data port (ADR-154): the nanny's own read is the
// `verification_status` view (07 §5.2 — never the base table), the three wizard writes are `0022`'s
// session-scope definers, and the provider-side write is `apply_vetting_check_result()` at **service** scope
// (service_role only — named in the module README, 07 §5.1 rule 5).
import type { DataAccessPort } from "@/modules/auth";
import { ok } from "@/modules/platform";
import type { Instant, Result, UserId } from "@/modules/shared-types";
import type {
  ApplyCheckResultInput,
  SectionState,
  VerificationErrorDetails,
  VerificationSection,
  VerificationState,
  VerificationStore,
} from "@/modules/verification";

const session = { scope: "session" as const };
const service = { scope: "service" as const };

const asVerification = <T>(
  result: Result<T>,
): Result<T, VerificationErrorDetails> =>
  result as Result<T, VerificationErrorDetails>;

type StatusRow = {
  readonly nanny_id: string;
  readonly level: VerificationState["level"];
  readonly is_suspended: boolean;
  readonly identity_status: SectionState["status"];
  readonly identity_status_at: string | null;
  readonly identity_evidence_type: string | null;
  readonly identity_user_guidance: { key?: string } | null;
  readonly identity_rejection_reason: string | null;
  readonly identity_attempts: number;
  readonly dbs_status: SectionState["status"];
  readonly dbs_status_at: string | null;
  readonly dbs_user_guidance: { key?: string } | null;
  readonly dbs_rejection_reason: string | null;
  readonly rtw_status: SectionState["status"];
  readonly rtw_status_at: string | null;
  readonly rtw_evidence_type: string | null;
  readonly rtw_user_guidance: { key?: string } | null;
  readonly rtw_rejection_reason: string | null;
  readonly contact_status: SectionState["status"];
};

const opt = <T>(key: string, value: T | null | undefined) =>
  value === null || value === undefined ? {} : { [key]: value };

const stateOf = (userId: UserId, row: StatusRow): VerificationState => ({
  nannyId: userId,
  level: row.level,
  suspended: row.is_suspended,
  sections: [
    { section: "contact", status: row.contact_status },
    {
      section: "identity",
      status: row.identity_status,
      attempts: row.identity_attempts,
      ...opt("rejectionReason", row.identity_rejection_reason),
      ...opt("guidanceKey", row.identity_user_guidance?.key),
      ...opt("statusAt", row.identity_status_at as Instant | null),
    },
    {
      section: "dbs",
      status: row.dbs_status,
      ...opt("rejectionReason", row.dbs_rejection_reason),
      ...opt("guidanceKey", row.dbs_user_guidance?.key),
      ...opt("statusAt", row.dbs_status_at as Instant | null),
    },
    {
      section: "right-to-work",
      status: row.rtw_status,
      ...opt("rejectionReason", row.rtw_rejection_reason),
      ...opt("guidanceKey", row.rtw_user_guidance?.key),
      ...opt("statusAt", row.rtw_status_at as Instant | null),
    },
  ],
});

const SECTION_OF_LEDGER: Readonly<Record<string, VerificationSection>> =
  Object.freeze({
    identity: "identity",
    dbs: "dbs",
    right_to_work: "right-to-work",
  });

export function dbVerificationStore(port: DataAccessPort): VerificationStore {
  return Object.freeze({
    getStatus: async (userId) =>
      asVerification(
        await port.run<VerificationState | null>(
          {
            name: "verification.readStatus",
            exec: async (q) => {
              // the view keys on the party row (`nannies.id`), the wizard on the user (R-7)
              const nanny = (await q
                .from("nannies")
                .eq("user_id", userId as string)
                .single()) as { readonly id: string } | null;
              if (nanny === null) return null;
              const row = (await q
                .from("verification_status")
                .eq("nanny_id", nanny.id)
                .single()) as StatusRow | null;
              return row === null ? null : stateOf(userId, row);
            },
          },
          session,
        ),
      ),
    saveContact: async () =>
      asVerification(
        await port.run<void>(
          {
            name: "verification.saveContact",
            exec: async (q) => {
              await q.rpc("save_verification_contact", undefined as never);
            },
          },
          session,
        ),
      ),
    claimProcessing: async () =>
      asVerification(
        await port.run<ReadonlyArray<VerificationSection>>(
          {
            name: "verification.claimProcessing",
            exec: async (q) => {
              const claimed = (await q.rpc(
                "claim_verification_processing",
                undefined as never,
              )) as ReadonlyArray<string> | null;
              return (claimed ?? [])
                .map((name) => SECTION_OF_LEDGER[name])
                .filter((s): s is VerificationSection => s !== undefined);
            },
          },
          session,
        ),
      ),
    // ADR-154 (5): service_role only — the boot adapter is the one caller (module README).
    applyCheckResult: async (input: ApplyCheckResultInput) =>
      asVerification(
        await port.run<{
          readonly section: VerificationSection;
          readonly status: SectionState["status"];
        }>(
          {
            name: "verification.applyCheckResult",
            exec: async (q) => {
              const out = (await q.rpc("apply_vetting_check_result", {
                p_submission_id: input.submissionId,
                p_status: input.status.kind,
                p_reject_reason:
                  input.status.kind === "rejected"
                    ? input.status.reason
                    : undefined,
                p_guidance_key:
                  input.status.kind === "rejected"
                    ? input.status.guidanceKey
                    : undefined,
                p_extracted: (input.extracted ?? undefined) as never,
                p_checked_by: input.checkedBy,
                p_expires_at:
                  input.status.kind === "verified"
                    ? input.status.expiresAt
                    : undefined,
              })) as {
                readonly section: string;
                readonly status: SectionState["status"];
              };
              return {
                section: SECTION_OF_LEDGER[out.section] ?? "identity",
                status: out.status,
              };
            },
          },
          service,
        ),
      ),
  });
}
