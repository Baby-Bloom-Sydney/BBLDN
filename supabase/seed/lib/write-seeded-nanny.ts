// One seeded nanny, end to end: the person, the marketplace row, the biometric consent her identity section
// cannot exist without (I-V3), the `verifications` row in the state asked for — and then the sync, which is
// what decides her level (ADR-157). The seed never writes a level; it asks for one.
import type { Client } from "pg";
import { VETTING } from "../../../src/modules/config/vetting.ts";
import { requiredSectionsByLevel } from "../../../src/modules/verification/lib/required-sections-by-level.ts";
import { syntheticPerson } from "./synthetic-person.ts";
import { verificationColumns } from "./verification-columns.ts";
import { writePerson } from "./write-person.ts";
import { writeVerificationRow } from "./write-verification-row.ts";
import type { NannyState, SeedArea } from "./types.ts";

/** ADR-157 (1): the sync's `p_required` — the same computation `src/boot` makes, from the same config. */
const REQUIRED = requiredSectionsByLevel(VETTING.requiredChecksByLevel);

/** Mon–Fri days, in the one block vocabulary `nannies.availability` and `position_schedule` share (02 §4.2). */
const WEEKDAY_AVAILABILITY = Object.freeze({
  monday: ["morning", "midday", "afternoon"],
  tuesday: ["morning", "midday", "afternoon"],
  wednesday: ["morning", "midday", "afternoon"],
  thursday: ["morning", "midday", "afternoon"],
  friday: ["morning", "midday", "afternoon"],
});

export type SeededNanny = {
  readonly nannyId: string;
  readonly userId: string;
  readonly level: string;
};

export type NannySpec = {
  readonly index: number;
  readonly area: SeedArea;
  readonly state: NannyState;
  readonly adminUserId: string;
  readonly isolated: boolean;
};

export async function writeSeededNanny(
  db: Client,
  spec: NannySpec,
): Promise<SeededNanny> {
  const person = syntheticPerson("nanny", spec.index);
  const userId = await writePerson(db, person, "nanny", spec.area);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.nannies (user_id, bio, years_experience, languages, has_driving_licence,
                                 is_non_smoker, comfortable_with_pets, hourly_rate_min_pence,
                                 availability, available_from, profile_visible, is_isolated,
                                 isolation_lifted_at)
     values ($1, $2, $3, $4, true, true, true, $5, $6, current_date, true, $7, $8) returning id`,
    [
      userId,
      `${person.firstName} is a seeded profile for local development.`,
      3 + (spec.index % 8),
      ["English"],
      1800 + (spec.index % 5) * 100,
      JSON.stringify(WEEKDAY_AVAILABILITY),
      spec.isolated,
      spec.isolated ? null : new Date().toISOString(),
    ],
  );
  const nannyId = rows[0].id;
  const consentId =
    verificationColumns(spec.state).identityStatus === "not_started"
      ? null
      : await writeBiometricConsent(db, userId);
  await writeVerificationRow(db, {
    nannyId,
    consentId,
    state: spec.state,
    person,
    index: spec.index,
    adminUserId: spec.adminUserId,
  });
  return { nannyId, userId, level: await syncLevel(db, nannyId) };
}

/** AGR-04 (07 §2.6): identity cannot leave `not_started` without it (`..._needs_biometric_consent_check`). */
async function writeBiometricConsent(
  db: Client,
  userId: string,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.consent_records
        (user_id, party, agreement_id, checkpoint_id, checkpoint_text, purpose, consent_given)
     values ($1, 'nanny', 'AGR-04', 'agr04_biometric_consent',
             'Seeded consent record for local development.', 'biometric-notice', true)
     returning id`,
    [userId],
  );
  return rows[0].id;
}

/** 0023's ONE level writer (ADR-157), called exactly as `src/boot` calls it. */
async function syncLevel(db: Client, nannyId: string): Promise<string> {
  const { rows } = await db.query<{ result: { to_level: string } }>(
    `select public.sync_nanny_verification_state($1, $2::jsonb) as result`,
    [nannyId, JSON.stringify(REQUIRED)],
  );
  return rows[0].result.to_level;
}
