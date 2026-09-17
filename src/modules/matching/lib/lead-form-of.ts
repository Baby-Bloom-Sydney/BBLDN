// The wizard's answers → `scoring`'s `LeadForm` (03 §7.2). `null` when the answers cannot make one yet (no
// area) — S-X-04 sends that parent back to S-X-03 rather than guessing a district.
import type { AgeLabel, LeadForm } from "@/modules/scoring";
import type { WizardAnswers } from "../types";
import { quickMatchSchedule } from "./quick-match-schedule";

export function leadFormOf(answers: WizardAnswers): LeadForm | null {
  if (answers.area === undefined) return null;
  const schedule = quickMatchSchedule({
    days: answers.days ?? [],
    parts: answers.parts ?? [],
  });
  return Object.freeze({
    area: answers.area,
    children: Object.freeze(
      (answers.children ?? []).map((child) => ({
        ageLabel: child.ageLabel as AgeLabel,
      })),
    ),
    schedule:
      schedule === null
        ? null
        : { ...schedule, type: answers.scheduleType ?? "Fixed" },
    requirements: Object.freeze({
      licence: answers.drivingLicence === true,
      car: answers.car === true,
      nonSmoker: answers.nonSmoker === true,
      pets: answers.petsAtHome === true,
      languages: answers.languages,
      capacity: (answers.children ?? []).length,
    }),
  });
}
