// 03 §7.3 `preAuthMatch`: the lead form → an in-memory position through `MATCHING.ageRangeToMonths`. An age
// label the config does not know is `VALIDATION` (03 §7.3), never a silent default.
import { err, ok } from "@/modules/platform";
import type {
  LeadForm,
  MatchingConfig,
  PositionInput,
  Requirements,
  ScoreResult,
} from "../../types";

const AGE_BAND_MONTHS = 12;

const DEFAULT_REQUIREMENTS: Requirements = Object.freeze({
  childAgeMonths: [],
  capacity: 0,
  specialNeeds: false,
  licence: false,
  car: false,
  vaccination: false,
  nonSmoker: false,
  pets: false,
  roleType: "",
});

export function leadFormToPosition(
  leadForm: LeadForm,
  config: MatchingConfig,
): ScoreResult<PositionInput> {
  const months: Array<{ readonly min: number; readonly max: number }> = [];
  for (const child of leadForm.children) {
    const centre = config.ageRangeToMonths[child.ageLabel];
    if (centre === undefined)
      return err("VALIDATION", "Unknown child age label", {
        reason: "invalid-input" as const,
      });
    months.push({
      min: Math.max(0, centre - AGE_BAND_MONTHS / 2),
      max: centre + AGE_BAND_MONTHS / 2,
    });
  }
  return ok({
    area: leadForm.area,
    schedule: leadForm.schedule,
    requirements: {
      ...DEFAULT_REQUIREMENTS,
      ...leadForm.requirements,
      childAgeMonths: months,
      capacity: leadForm.requirements.capacity ?? months.length,
    },
  });
}
