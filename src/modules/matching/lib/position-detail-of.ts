// The wizard's answers → the position detail `positions` stores and hands back to `autofire`
// (`PositionMatchDetail`, 03 §7.4). One mapping for both roads into P-2: the one-go signup (04 §3.1 step 5,
// path B) and the in-app position flow S-P-04 (paths A · C · D, trigger b) — the same question bank, so the
// same conversion, never two.
//
// `null` when the answers cannot make a position yet (no area, or an age label `config` does not know). The
// caller stops and asks rather than guessing a district: a guessed district would match the wrong nannies and
// the parent would find out on the call.
import { MATCHING } from "@/modules/config";
import { leadFormToPosition } from "@/modules/scoring";
import type { PositionMatchDetail } from "@/modules/positions";
import type { WizardAnswers } from "../types";
import { leadFormOf } from "./lead-form-of";

export function positionDetailOf(
  answers: WizardAnswers,
): PositionMatchDetail | null {
  const leadForm = leadFormOf(answers);
  if (leadForm === null) return null;
  const position = leadFormToPosition(leadForm, MATCHING);
  if (!position.ok) return null;
  const { area, schedule, requirements } = position.value;
  return Object.freeze({
    area,
    schedule,
    requirements,
    ...(answers.minExperienceYears === undefined
      ? {}
      : { minExperienceYears: answers.minExperienceYears }),
  });
}
