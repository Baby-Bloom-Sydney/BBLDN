// The `VerificationStore` of `verification` over `auth`'s data port (ADR-154): the nanny's own read is the
// `verification_status` view (07 §5.2 — never the base table), the three wizard writes are `0022`'s
// session-scope definers, and the provider-side write is `apply_vetting_check_result()` at **service** scope
// (service_role only — named in the module README, 07 §5.1 rule 5).
import type { DataAccessPort } from "@/modules/auth";
import { VETTING } from "@/modules/config";
import { err, ok } from "@/modules/platform";
import { ENUMS } from "@/modules/shared-types";
import type {
  Instant,
  Result,
  SubmissionId,
  UserId,
} from "@/modules/shared-types";
import type {
  AdminRecord,
  ApplyCheckResultInput,
  LevelSync,
  SectionExpiry,
  SectionState,
  VerificationDecisionStore,
  VerificationErrorDetails,
  VerificationLevel,
  VerificationSection,
  VerificationState,
  VerificationStore,
} from "@/modules/verification";
import { requiredSectionsByLevel } from "@/modules/verification";

/** ADR-157 (1): the sync's `p_required` — `VETTING.requiredChecksByLevel` as sections, computed once at boot. */
const REQUIRED = requiredSectionsByLevel(VETTING.requiredChecksByLevel);

type SyncOut = {
  readonly from_level: VerificationLevel;
  readonly to_level: VerificationLevel;
  readonly suspended: boolean;
  readonly released: number;
};
const syncOf = (out: SyncOut): LevelSync => ({
  fromLevel: out.from_level,
  toLevel: out.to_level,
  suspended: out.suspended,
  released: out.released,
});

/** The base-table columns the admin's read carries (02 §4.3 "admin all"; the view omits them by design, 07 §5.2). */
type AdminRow = {
  readonly nanny_id: string;
  readonly level: VerificationLevel;
  readonly suspended_at: string | null;
  readonly surname: string | null;
  readonly given_names: string | null;
  readonly date_of_birth: string | null;
  readonly identity_evidence_type: string | null;
  readonly identity_document_ref: string | null;
  readonly identity_selfie_ref: string | null;
  readonly identity_status: SectionState["status"];
  readonly identity_document_expiry: string | null;
  readonly identity_provider_ref: string | null;
  readonly dbs_status: SectionState["status"];
  readonly dbs_certificate_ref: string | null;
  readonly dbs_certificate_number: string | null;
  readonly dbs_issue_date: string | null;
  readonly dbs_outcome: AdminRecord["dbsOutcome"];
  readonly dbs_expires_at: string | null;
  readonly dbs_provider_ref: string | null;
  readonly dbs_update_service_consent_at: string | null;
  readonly dbs_update_service_last_checked_at: string | null;
  readonly dbs_update_service_last_result: NonNullable<
    AdminRecord["updateService"]["lastResult"]
  > | null;
  readonly dbs_update_service_subscribed: boolean | null;
  readonly cross_check_status: string;
  readonly rtw_status: SectionState["status"];
  readonly rtw_evidence_type: string | null;
  readonly rtw_share_code: string | null;
  readonly rtw_document_ref: string | null;
  readonly rtw_expires_at: string | null;
  readonly rtw_provider_ref: string | null;
  readonly rtw_status_at: string | null;
  readonly identity_status_at: string | null;
  readonly dbs_status_at: string | null;
};

const BUCKET = "verification-documents" as const;
const docOf = (
  section: AdminRecord["documents"][number]["section"],
  path: string | null,
): AdminRecord["documents"] =>
  path === null ? [] : [{ section, ref: { bucket: BUCKET, path } }];

const recordOf = (userId: UserId, row: AdminRow): AdminRecord => ({
  nannyId: userId,
  level: row.level,
  suspended: row.suspended_at !== null,
  declared: {
    ...opt("surname", row.surname),
    ...opt("givenNames", row.given_names),
    ...opt("dateOfBirth", row.date_of_birth as never),
    ...opt("idType", row.identity_evidence_type as never),
    ...opt("certificateNumber", row.dbs_certificate_number),
    ...opt("issueDate", row.dbs_issue_date as never),
    ...opt("rtwKind", row.rtw_evidence_type as never),
    ...opt("shareCode", row.rtw_share_code),
  },
  documents: [
    ...docOf("identity-document", row.identity_document_ref),
    ...docOf("identity-selfie", row.identity_selfie_ref),
    ...docOf("dbs-certificate", row.dbs_certificate_ref),
    ...docOf("rtw-document", row.rtw_document_ref),
  ],
  dbsOutcome: row.dbs_outcome,
  crossCheckPassed: row.cross_check_status === "passed",
  updateService: {
    ...opt("consentAt", row.dbs_update_service_consent_at as Instant | null),
    ...opt("lastCheckedAt", row.dbs_update_service_last_checked_at as Instant | null),
    ...opt("lastResult", row.dbs_update_service_last_result),
    ...opt("subscribed", row.dbs_update_service_subscribed),
  },
});

/** A verified section's expiry, as the expiry job walks it: the decided submission (`_provider_ref`) + `_expires_at`. */
const expiriesOf = (row: AdminRow, userId: UserId): ReadonlyArray<SectionExpiry> => {
  const one = (
    section: VerificationSection,
    status: SectionState["status"],
    ref: string | null,
    expiresAt: string | null,
  ): ReadonlyArray<SectionExpiry> =>
    status === "verified" && ref !== null && expiresAt !== null
      ? [{ nannyId: userId, section, submissionId: ref as SubmissionId, expiresAt: expiresAt as Instant }]
      : [];
  return [
    ...one("identity", row.identity_status, row.identity_provider_ref, row.identity_document_expiry),
    ...one("dbs", row.dbs_status, row.dbs_provider_ref, row.dbs_expires_at),
    ...one("right-to-work", row.rtw_status, row.rtw_provider_ref, row.rtw_expires_at),
  ];
};

const OPEN: ReadonlySet<string> = new Set(["not_started", "rejected", "failed", "expired"]);
const rank = (level: VerificationLevel): number => ENUMS.verification_level.indexOf(level);

const session = { scope: "session" as const };
const service = { scope: "service" as const };

const asVerification = <T>(
  result: Result<T>,
): Result<T, VerificationErrorDetails> =>
  result as Result<T, VerificationErrorDetails>;

const opt = <T>(key: string, value: T | null | undefined) =>
  value === null || value === undefined ? {} : { [key]: value };

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

export function dbVerificationStore(
  port: DataAccessPort,
): VerificationStore & VerificationDecisionStore {
  /** `verifications` rows joined to their party row's user id — service scope, the sweeps' read (07 §5.1 rule 5). */
  const readAll = async (
    name: `verification.${string}`,
  ): Promise<Result<ReadonlyArray<{ readonly userId: UserId; readonly row: AdminRow }>, VerificationErrorDetails>> =>
    asVerification(
      await port.run<ReadonlyArray<{ readonly userId: UserId; readonly row: AdminRow }>>(
        {
          name,
          exec: async (q) => {
            const rows = (await q.from("verifications").select()) as unknown as ReadonlyArray<AdminRow>;
            const nannies = (await q.from("nannies").select()) as unknown as ReadonlyArray<{
              readonly id: string;
              readonly user_id: string;
            }>;
            const userOf = new Map(nannies.map((n) => [n.id, n.user_id as UserId]));
            return rows.flatMap((row) => {
              const userId = userOf.get(row.nanny_id);
              return userId === undefined ? [] : [{ userId, row }];
            });
          },
        },
        service,
      ),
    );
  const nannyIdOf = async (
    q: Parameters<Parameters<DataAccessPort["run"]>[0]["exec"]>[0],
    userId: UserId,
  ): Promise<string | null> => {
    const nanny = (await q
      .from("nannies")
      .eq("user_id", userId as string)
      .single()) as { readonly id: string } | null;
    return nanny === null ? null : nanny.id;
  };
  const rpcSync = (
    name: `verification.${string}`,
    call: (q: Parameters<Parameters<DataAccessPort["run"]>[0]["exec"]>[0]) => Promise<unknown>,
  ) =>
    port.run<LevelSync>(
      {
        name,
        exec: async (q) => syncOf((await call(q)) as SyncOut),
      },
      service,
    );

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

    // ── the decision side (0023; ADR-157) ──

    // The base table, at SESSION scope: 02 §4.3 gives an admin every column, and the caller is an admin
    // (`requireAdmin` in the connector), so RLS is the second gate here rather than a service-role use.
    readAdminRecord: async (userId) =>
      asVerification(
        await port.run<AdminRecord | null>(
          {
            name: "verification.readAdminRecord",
            exec: async (q) => {
              const nannyId = await nannyIdOf(q, userId);
              if (nannyId === null) return null;
              const row = (await q
                .from("verifications")
                .eq("nanny_id", nannyId)
                .single()) as AdminRow | null;
              return row === null ? null : recordOf(userId, row);
            },
          },
          session,
        ),
      ),
    // `sync_nanny_verification_state()` — service_role only; idempotent, so asking after a definer already
    // synced answers the same level (module README, 07 §5.1 rule 5).
    syncLevel: async (userId) =>
      asVerification(
        await rpcSync("verification.syncLevel", async (q) => {
          const nannyId = await nannyIdOf(q, userId);
          if (nannyId === null)
            return { from_level: "L0_SIGNED_UP", to_level: "L0_SIGNED_UP", suspended: false, released: 0 };
          return q.rpc("sync_nanny_verification_state", {
            p_nanny_id: nannyId,
            p_required: REQUIRED as never,
          });
        }),
      ),
    recordUpdateServiceCheck: async (input) =>
      asVerification(
        await rpcSync("verification.recordUpdateServiceCheck", async (q) => {
          const nannyId = await nannyIdOf(q, input.nannyId);
          if (nannyId === null) throw new Error("no nannies row for that user");
          return q.rpc("record_update_service_check", {
            p_nanny_id: nannyId,
            p_result: input.result,
            p_subscribed: input.subscribed,
            p_checked_by: input.checkedBy as string,
            p_required: REQUIRED as never,
          });
        }),
      ),
    expireSection: async (submissionId) =>
      asVerification(
        await rpcSync("verification.expireSection", (q) =>
          q.rpc("expire_verification_section", {
            p_submission_id: submissionId as string,
            p_required: REQUIRED as never,
          }),
        ),
      ),
    // the SQL judges "stale" by its own clock; `now` is the run's instant, carried for the log line only
    sweepStale: async (staleMinutes) =>
      asVerification(
        await port.run<number>(
          {
            name: "verification.sweepStale",
            exec: async (q) =>
              (await q.rpc("sweep_stale_verification_processing", {
                p_stale_minutes: staleMinutes,
              })) as number,
          },
          service,
        ),
      ),
    listExpiries: async () => {
      const all = await readAll("verification.listExpiries");
      if (!all.ok) return all;
      return ok(all.value.flatMap(({ userId, row }) => expiriesOf(row, userId)));
    },
    listRemindable: async (belowLevel) => {
      const all = await readAll("verification.listRemindable");
      if (!all.ok) return all;
      return ok(
        all.value.flatMap(({ userId, row }) => {
          if (rank(row.level) >= rank(belowLevel) || row.suspended_at !== null) return [];
          const statuses = [row.identity_status, row.dbs_status, row.rtw_status];
          if (!statuses.some((s) => OPEN.has(s))) return [];
          const last = [row.identity_status_at, row.dbs_status_at, row.rtw_status_at]
            .filter((at): at is string => at !== null)
            .sort()
            .at(-1);
          return last === undefined ? [] : [{ nannyId: userId, level: row.level, lastChangeAt: last as Instant }];
        }),
      );
    },
    // the view answers an admin every row (0016); a level count is the queue's counter, no service-role use
    countByLevel: async () =>
      asVerification(
        await port.run<Readonly<Record<VerificationLevel, number>>>(
          {
            name: "verification.countByLevel",
            exec: async (q) => {
              const rows = (await q.from("verification_status").select()) as unknown as ReadonlyArray<{
                readonly level: VerificationLevel;
              }>;
              const counts = Object.fromEntries(
                ENUMS.verification_level.map((level) => [level, 0]),
              ) as Record<VerificationLevel, number>;
              for (const row of rows) counts[row.level] += 1;
              return counts;
            },
          },
          session,
        ),
      ),
  });
}
