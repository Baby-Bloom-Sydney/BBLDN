// The position detail → the wizard's answers: the other direction of `positionDetailOf`, and the prefill S-P-04
// needs in its **edit** state (04 §6.2 — S-P-05 exits to "S-P-04 (edit)", and the screen's states are
// "new · edit (no re-fire) · prefilled").
//
// It lives beside its inverse on purpose: one file owns both directions of the same mapping, so a question that
// changes shape cannot make the edit screen and the create screen disagree about the same answer.
//
// **What it can and cannot recover, stated rather than guessed.** `positionDetailOf` carries area, the child
// ages, the roster, the schedule kind, the five boolean requirements, the languages and the minimum experience
// into `PositionMatchDetail`, and this reads every one of them back. It carries `hoursPerWeek`,
// `placementLength`, `startWhen`, `focus` and `support` **nowhere** — those five answers have no field on the
// position and no column behind it, so they are not stored at create either, and an edit re-asks them rather
// than showing a remembered answer that was never kept. Recorded in the L-007 PROGRESS entry; the fix is a home
// for them, not a guess here.
//
// The child age round trip is exact, not approximate: `leadFormToPosition` writes `{ centre - 6, centre + 6 }`
// from `MATCHING.ageRangeToMonths[label]`, so `centre = max - 6` and the label is the key holding that value.
// A band whose centre matches no label is dropped — the answer is then incomplete and the wizard asks, which is
// better than inventing an age for somebody's child.
import { MATCHING } from "@/modules/config";
import type { PositionMatchDetail } from "@/modules/positions";
import type {
  QuickMatchDay,
  QuickMatchPart,
  WizardAnswers,
  WizardChild,
} from "../types";

const AGE_BAND_MONTHS = 12;

const labelForCentre = (centre: number): string | null => {
  for (const [label, months] of Object.entries(MATCHING.ageRangeToMonths))
    if (months === centre) return label;
  return null;
};

const childrenOf = (
  bands: PositionMatchDetail["requirements"]["childAgeMonths"],
): ReadonlyArray<WizardChild> =>
  Object.freeze(
    bands
      .map((band) => labelForCentre(band.max - AGE_BAND_MONTHS / 2))
      .filter((label): label is string => label !== null)
      .map((ageLabel) => ({ ageLabel })),
  );

const uniq = <T>(values: ReadonlyArray<T>): ReadonlyArray<T> =>
  Object.freeze([...new Set(values)]);

export function wizardAnswersOf(detail: PositionMatchDetail): WizardAnswers {
  const blocks = detail.schedule?.blocks ?? [];
  const children = childrenOf(detail.requirements.childAgeMonths);
  const requirements = detail.requirements;
  return Object.freeze({
    ...(children.length === 0 ? {} : { children }),
    area: detail.area,
    ...(blocks.length === 0
      ? {}
      : {
          days: uniq(
            blocks.map((block) => block.day),
          ) as ReadonlyArray<QuickMatchDay>,
          parts: uniq(
            blocks.map((block) => block.part),
          ) as ReadonlyArray<QuickMatchPart>,
        }),
    ...(detail.schedule === null ? {} : { scheduleType: detail.schedule.type }),
    ...(detail.minExperienceYears === undefined
      ? {}
      : { minExperienceYears: detail.minExperienceYears }),
    drivingLicence: requirements.licence,
    car: requirements.car,
    nonSmoker: requirements.nonSmoker,
    petsAtHome: requirements.pets,
    ...(requirements.languages === undefined
      ? {}
      : { languages: requirements.languages }),
  });
}
