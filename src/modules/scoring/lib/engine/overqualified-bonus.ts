// Layer 3 (03 §7.1 "over-qualified bonuses (cap)"): compounding multipliers from `MATCHING.bonuses`, each
// capped by its own cap and the product by `bonusCap`; the bonus names are returned (03 §7.2 `Ranked.bonuses`).
import type { Candidate, MatchingConfig, PositionInput } from "../../types";

export type Bonus = {
  readonly multiplier: number;
  readonly bonuses: ReadonlyArray<string>;
};

const AGE_STEP_YEARS = 2;

export function overqualifiedBonus(
  position: PositionInput,
  candidate: Candidate,
  config: MatchingConfig,
  at: string | undefined,
): Bonus {
  const b = config.bonuses;
  const names: string[] = [];
  let multiplier = 1;
  const grant = (name: string, factor: number): void => {
    multiplier *= factor;
    names.push(name);
  };

  const required = position.minExperienceYears ?? 0;
  if (required > 0 && candidate.experienceYears > required)
    grant(
      "extra-experience",
      Math.min(
        b.extraExperienceCap,
        b.extraExperiencePerYear ** (candidate.experienceYears - required),
      ),
    );
  if (candidate.certifications.length > 0)
    grant(
      "certifications",
      Math.min(
        b.certificationCap,
        b.certificationPer ** candidate.certifications.length,
      ),
    );
  const rungWanted = position.minQualificationRung ?? 0;
  if (rungWanted > 0 && candidate.qualificationRung > rungWanted)
    grant("higher-qualification", b.higherQualification);
  if (!position.requirements.car && candidate.hasCar)
    grant("car", b.carUnrequired);
  if (
    at !== undefined &&
    candidate.availableFrom !== undefined &&
    candidate.availableFrom <= at
  )
    grant("immediate-start", b.immediateStart);
  const languages = position.requirements.languages ?? [];
  if (languages.some((language) => candidate.languages.includes(language)))
    grant("language-match", b.languageMatch);
  const minAge = position.requirements.nannyAge?.min;
  if (
    minAge !== undefined &&
    candidate.age !== undefined &&
    candidate.age > minAge
  )
    grant(
      "age-over-minimum",
      Math.min(
        b.ageOverMinCap,
        b.ageOverMinPerTwo **
          Math.floor((candidate.age - minAge) / AGE_STEP_YEARS),
      ),
    );

  return {
    multiplier: Math.min(config.bonusCap, multiplier),
    bonuses: Object.freeze(names),
  };
}
