// One `nanny_positions` row (+ its `position_schedule` row, its parent's user id and the address that parent
// reads today) → the `PositionRecord` the module holds (03 §2.5). Pure, and the inverse of `position-row.ts`.
//
// The snapshot is the **shape**; every column that means something overrides it. That is what makes an admin
// edit made straight on the table visible to the module rather than shadowed by a stale jsonb corner, and it is
// `0006`'s own rule for `details` read in the read direction.
import type { PositionMatchDetail, PositionRecord } from "@/modules/positions";
import type {
  EndReason,
  CloseReason,
  Email,
  Instant,
  LeadId,
  NannyId,
  ParentId,
  PositionId,
  PositionStage,
} from "@/modules/shared-types";
import type { PositionSource } from "@/modules/positions";

/** The columns this adapter reads. Named here so the `as` at the driver seam is one cast, not many. */
export type PositionRowRead = {
  readonly id: string;
  readonly parent_id: string;
  readonly source: string;
  readonly stage: string;
  readonly created_at: string;
  readonly area: string | null;
  readonly district: string | null;
  readonly schedule_type: string | null;
  readonly car_required: boolean | null;
  readonly driving_licence_required: boolean | null;
  readonly non_smoker_required: boolean | null;
  readonly pets_ok_required: boolean | null;
  readonly vaccination_required: boolean | null;
  readonly minimum_nanny_age: number | null;
  readonly language_preference: ReadonlyArray<string> | null;
  readonly years_experience_min: number | null;
  readonly start_date: string | null;
  readonly activated_at: string | null;
  readonly filled_by_nanny_id: string | null;
  readonly end_reason: string | null;
  readonly close_reason: string | null;
  readonly precheck_fired_at: string | null;
  readonly precheck_expires_at: string | null;
  readonly precheck_wave_sent: number;
  readonly version: number;
  readonly details: unknown;
};

type ScheduleBlocks = NonNullable<PositionMatchDetail["schedule"]>["blocks"];

type Snapshot = {
  readonly detail?: PositionMatchDetail;
  readonly leadId?: LeadId;
};

const snapshotOf = (details: unknown): Snapshot =>
  typeof details === "object" && details !== null ? (details as Snapshot) : {};

/**
 * The kind is `nanny_positions.schedule_type`; the roster is `position_schedule`'s own row (02 §4.2 row 6 — "no
 * row = flexible, full marks"), and only the snapshot's blocks stand in when that row is missing.
 */
const scheduleOf = (
  row: PositionRowRead,
  stored: ScheduleBlocks | null,
  snapshot: PositionMatchDetail["schedule"],
): PositionMatchDetail["schedule"] => {
  if (row.schedule_type === null) return null;
  const blocks = stored ?? snapshot?.blocks ?? null;
  if (blocks === null) return null;
  return { type: row.schedule_type === "fixed" ? "Fixed" : "Flexible", blocks };
};

/** The columns win; the snapshot supplies only what `0006` gives no column for. */
function detailOf(
  row: PositionRowRead,
  snapshot: PositionMatchDetail,
  blocks: ScheduleBlocks | null,
): PositionMatchDetail {
  return Object.freeze({
    ...snapshot,
    area: {
      area: row.area ?? snapshot.area.area,
      district: row.district ?? snapshot.area.district,
    },
    schedule: scheduleOf(row, blocks, snapshot.schedule),
    requirements: {
      ...snapshot.requirements,
      car: row.car_required ?? snapshot.requirements.car,
      licence: row.driving_licence_required ?? snapshot.requirements.licence,
      nonSmoker: row.non_smoker_required ?? snapshot.requirements.nonSmoker,
      pets: row.pets_ok_required ?? snapshot.requirements.pets,
      vaccination:
        row.vaccination_required ?? snapshot.requirements.vaccination,
      ...(row.minimum_nanny_age === null
        ? {}
        : { nannyAge: { min: row.minimum_nanny_age } }),
      ...(row.language_preference === null ||
      row.language_preference.length === 0
        ? {}
        : { languages: [...row.language_preference] }),
    },
    ...(row.years_experience_min === null
      ? {}
      : { minExperienceYears: row.years_experience_min }),
    ...(row.start_date === null
      ? {}
      : {
          startDate: `${row.start_date.slice(0, 10)}T00:00:00.000Z` as Instant,
        }),
  });
}

export function positionRecordFromRow(input: {
  readonly row: PositionRowRead;
  readonly parentUserId: ParentId;
  readonly recipient: { readonly email: Email; readonly name?: string };
  /** `position_schedule.schedule` when the row exists; `null` when it does not. */
  readonly scheduleBlocks: ScheduleBlocks | null;
}): PositionRecord {
  const snapshot = snapshotOf(input.row.details);
  const detail = snapshot.detail;
  if (detail === undefined)
    throw new Error(
      `positions: row ${input.row.id} carries no detail snapshot`,
    );
  return Object.freeze({
    positionId: input.row.id as PositionId,
    parentId: input.parentUserId,
    source: input.row.source as PositionSource,
    stage: input.row.stage as PositionStage,
    detail: detailOf(input.row, detail, input.scheduleBlocks),
    recipient: input.recipient,
    ...(snapshot.leadId === undefined ? {} : { leadId: snapshot.leadId }),
    createdAt: input.row.created_at as Instant,
    ...(input.row.activated_at === null
      ? {}
      : { activatedAt: input.row.activated_at as Instant }),
    ...(input.row.end_reason === null
      ? {}
      : { endReason: input.row.end_reason as EndReason }),
    ...(input.row.close_reason === null
      ? {}
      : { closeReason: input.row.close_reason as CloseReason }),
    ...(input.row.filled_by_nanny_id === null
      ? {}
      : { filledByNannyId: input.row.filled_by_nanny_id as NannyId }),
    precheck:
      input.row.precheck_fired_at === null
        ? null
        : {
            firedAt: input.row.precheck_fired_at as Instant,
            expiresAt: (input.row.precheck_expires_at ??
              input.row.precheck_fired_at) as Instant,
            wave: input.row.precheck_wave_sent,
          },
    version: input.row.version,
  });
}
