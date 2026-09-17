// Layer 1, experience (Sydney's shape carried, 03 §7.5): a general half from years against the position's
// minimum, and an age half — the youngest child sets how much experience counts. Points only; no names.
import type { Candidate, PositionInput } from "../../types";

const GENERAL_MAX = 50;
const GENERAL_BASE = 20;
const GENERAL_PER_YEAR = 5;
const MET_BASE = 40;
const MET_EXTRA_PER_YEAR = 2;
const MET_EXTRA_CAP = 10;
const UNMET_SCALE = 30;
const AGE_DEFAULT = 30;
const AGE_INFANT_MONTHS = 12;
const AGE_TODDLER_MONTHS = 36;
const AGE_PER_YEAR = 10;
const AGE_INFANT_CAP = 50;
const AGE_TODDLER_CAP = 45;
const AGE_TODDLER_FLOOR = 5;
const MAX = 100;

function generalPoints(years: number, required: number): number {
  if (required === 0)
    return Math.min(GENERAL_MAX, GENERAL_BASE + years * GENERAL_PER_YEAR);
  if (years >= required)
    return (
      MET_BASE +
      Math.min(MET_EXTRA_CAP, (years - required) * MET_EXTRA_PER_YEAR)
    );
  return Math.round((years / required) * UNMET_SCALE);
}

function agePoints(years: number, youngestMonths: number | null): number {
  if (youngestMonths === null) return AGE_DEFAULT;
  if (youngestMonths <= AGE_INFANT_MONTHS)
    return years === 0 ? 0 : Math.min(AGE_INFANT_CAP, years * AGE_PER_YEAR);
  if (youngestMonths <= AGE_TODDLER_MONTHS)
    return years === 0
      ? AGE_TODDLER_FLOOR
      : Math.min(AGE_TODDLER_CAP, years * AGE_PER_YEAR);
  return AGE_DEFAULT;
}

export function scoreExperience(
  position: PositionInput,
  candidate: Candidate,
): number {
  const ages = position.requirements.childAgeMonths;
  const youngest =
    ages.length === 0 ? null : Math.min(...ages.map((range) => range.min));
  return Math.min(
    MAX,
    generalPoints(candidate.experienceYears, position.minExperienceYears ?? 0) +
      agePoints(candidate.experienceYears, youngest),
  );
}
