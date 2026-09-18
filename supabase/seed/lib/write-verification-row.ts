// The `verifications` row and, where the state has one, the provider ledger row the admin queue reads.
//
// **No level column is written.** Everything here is section state; `sync_nanny_verification_state()` (0023,
// ADR-157) turns it into a level afterwards. The one exception is not an exception: a `barred` row has to
// arrive already suspended, because `verifications_barred_is_suspended_check` is a row constraint (I-V5) —
// the sync then confirms the same thing rather than discovering it.
import type { Client } from "pg";
import { VETTING } from "../../../src/modules/config/vetting.ts";
import {
  verificationValues,
  type VerificationValues,
} from "./verification-values.ts";
import type { NannyState, SyntheticPerson } from "./types.ts";

/** 03 §4.4 / kickoff §4.4: `stub-manual` is the day-one provider for every evidence type. */
const PROVIDER_KEY = VETTING.providers[VETTING.acceptedEvidence[0]];

/** The `verifications` INSERT, hoisted so the writer reads as a function rather than a wall of SQL. */
const INSERT_VERIFICATION = `insert into public.verifications (
        nanny_id, biometric_consent_id, suspended_at,
        identity_status, identity_status_at, identity_evidence_type, identity_checked_by, identity_checked_at,
        surname, given_names,
        dbs_status, dbs_status_at, dbs_certificate_number, dbs_issue_date, dbs_outcome, dbs_checked_by,
        dbs_update_service_consent_at, dbs_update_service_subscribed,
        dbs_update_service_last_checked_at, dbs_update_service_last_result, dbs_update_service_checked_by,
        rtw_status, rtw_status_at, rtw_evidence_type, rtw_checked_by, rtw_checked_at,
        contact_status, contact_saved_at, cross_check_status, cross_check_at)
     values (
        $1::uuid, $2::uuid, $3::timestamptz,
        $4::public.section_status, now(), $5::public.identity_evidence_type,
        $6::public.checked_by, $7::timestamptz,
        $8::text, $9::text,
        $10::public.section_status, now(), $11::text,
        case when $11::text is null then null else current_date - 30 end,
        $12::public.dbs_outcome, $13::public.checked_by,
        $14::timestamptz, $15::boolean, $16::timestamptz, $17::public.update_service_result, $18::uuid,
        $19::public.section_status, now(), $20::public.rtw_evidence_type, $21::public.checked_by,
        $22::timestamptz,
        $23::public.section_status, now(), $24::public.cross_check_status, $25::timestamptz)
     returning id`;

export async function writeVerificationRow(
  db: Client,
  args: {
    readonly nannyId: string;
    readonly consentId: string | null;
    readonly state: NannyState;
    readonly person: SyntheticPerson;
    readonly index: number;
    readonly adminUserId: string;
  },
): Promise<void> {
  const v = verificationValues(
    args.state,
    args.person,
    args.index,
    args.adminUserId,
  );
  const { rows } = await db.query<{ id: string }>(
    INSERT_VERIFICATION,
    verificationParams(args.nannyId, args.consentId, v),
  );
  if (v.hasIdentitySubmission)
    await writeLedgerRow(
      db,
      rows[0].id,
      args.nannyId,
      v.ledgerStatus,
      args.adminUserId,
    );
}

/** A `*_at` instant exists exactly when the thing it dates does — never a stamp with nothing behind it. */
const stamp = (present: boolean): string | null =>
  present ? new Date().toISOString() : null;

/** The 25 bind parameters, in the column order above. Split out so the statement and its values stay readable. */
function verificationParams(
  nannyId: string,
  consentId: string | null,
  v: VerificationValues,
): unknown[] {
  return [
    nannyId,
    consentId,
    stamp(v.suspended),
    v.identityStatus,
    v.identityEvidenceType,
    v.identityCheckedBy,
    stamp(v.identityCheckedBy === "admin"),
    v.surname,
    v.givenNames,
    v.dbsStatus,
    v.dbsNumber,
    v.dbsOutcome,
    v.dbsCheckedBy,
    stamp(v.dbsNumber !== null),
    v.updateServiceSubscribed,
    stamp(v.updateServiceResult !== null),
    v.updateServiceResult,
    v.updateServiceCheckedBy,
    v.rtwStatus,
    v.rtwEvidenceType,
    v.rtwCheckedBy,
    stamp(v.rtwCheckedBy === "admin"),
    v.contactStatus,
    v.crossCheck,
    stamp(v.crossCheck !== "not_started"),
  ];
}

/** 02 §4.3 row 2: one row per submit attempt; the latest per section is that section's provider state. */
async function writeLedgerRow(
  db: Client,
  verificationId: string,
  nannyId: string,
  status: string,
  adminUserId: string,
): Promise<void> {
  const decided = status === "passed" || status === "failed";
  await db.query(
    `insert into public.vetting_submissions
        (verification_id, nanny_id, evidence_id, section, evidence_type, provider_key, status,
         checked_at, decided_by)
     values ($1, $2, gen_random_uuid(), 'identity', $3, $4, $5, $6, $7)`,
    [
      verificationId,
      nannyId,
      VETTING.acceptedEvidence[0],
      PROVIDER_KEY,
      status,
      decided ? new Date().toISOString() : null,
      decided ? adminUserId : null,
    ],
  );
}
