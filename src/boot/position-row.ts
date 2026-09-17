// One `PositionRecord` (03 §2.5) → the `nanny_positions` columns it belongs in (02 §4.2 row 4; `0006`). Pure.
//
// **A column is the source of truth for everything it holds.** `0006`'s own comment on `details` says so — "the
// form snapshot; never the source of truth for anything a column above holds" — so the columns `0006` names for
// area, schedule kind, the five boolean requirements, the nanny's minimum age, the language list, the earliest
// start and the pre-check lever are written as columns, and `details` carries **only** the rest of the detail
// (the child age bands, the capacity, the special-needs flag, the role type, the support needs and the
// qualification rung, none of which has a column that means them) plus the lead id, which `0006` gives no column
// at all — `parent_leads.position_id` (`0014`) is the link in the other direction.
//
// Recorded as a foundations question rather than guessed: `requirements.roleType` and `requirements.supportNeeds`
// LOOK like `reason_for_nanny` and `level_of_support`, but 02 §9 item 21 says those four UK vocabularies have no
// config list yet and `0006` deliberately gave them no CHECK. Mapping them here would put a product fact in an
// adapter, so they stay in the snapshot until the vocabulary lands.
//
// `start_date` is a `date` column, so it holds the day and not the instant: the round trip is day-precision, and
// the snapshot keeps what was handed in.
import type { AppDatabase } from "@/modules/auth";
import type { PositionRecord } from "@/modules/positions";
import type { Instant } from "@/modules/shared-types";

export type PositionInsertRow =
  AppDatabase["Tables"]["nanny_positions"]["Insert"];

/** 02 §3 `schedule_type` is lower case; 03 §7.1's `PositionInput` spells it `Fixed` / `Flexible`. */
const scheduleTypeOf = (
  record: PositionRecord,
): "fixed" | "flexible" | null => {
  const schedule = record.detail.schedule;
  if (schedule === null) return null;
  return schedule.type === "Fixed" ? "fixed" : "flexible";
};

/** What no column means — the honest remainder, kept whole so a read can rebuild the detail. */
const snapshotOf = (record: PositionRecord): Record<string, unknown> =>
  Object.freeze({
    detail: record.detail,
    ...(record.leadId === undefined ? {} : { leadId: record.leadId }),
  });

const requirementColumns = (record: PositionRecord) => {
  const requirements = record.detail.requirements;
  return {
    car_required: requirements.car,
    driving_licence_required: requirements.licence,
    non_smoker_required: requirements.nonSmoker,
    pets_ok_required: requirements.pets,
    vaccination_required: requirements.vaccination,
    minimum_nanny_age: requirements.nannyAge?.min ?? null,
    language_preference: [...(requirements.languages ?? [])],
    years_experience_min: record.detail.minExperienceYears ?? null,
    start_date: record.detail.startDate?.slice(0, 10) ?? null,
  };
};

const terminalColumns = (record: PositionRecord, now: Instant) => ({
  activated_at: record.activatedAt ?? null,
  filled_by_nanny_id: record.filledByNannyId ?? null,
  end_reason: record.endReason ?? null,
  ended_at: record.endReason === undefined ? null : now,
  close_reason: record.closeReason ?? null,
  closed_at: record.closeReason === undefined ? null : now,
});

export function positionRow(
  record: PositionRecord,
  parentRowId: string,
  now: Instant,
): PositionInsertRow {
  return Object.freeze({
    id: record.positionId as string,
    parent_id: parentRowId,
    source: record.source,
    stage: record.stage,
    version: record.version,
    created_at: record.createdAt,
    area: record.detail.area.area,
    district: record.detail.area.district,
    schedule_type: scheduleTypeOf(record),
    ...requirementColumns(record),
    ...terminalColumns(record, now),
    precheck_fired_at: record.precheck?.firedAt ?? null,
    precheck_expires_at: record.precheck?.expiresAt ?? null,
    precheck_wave_sent: record.precheck?.wave ?? 0,
    details: snapshotOf(record),
  }) as PositionInsertRow;
}
