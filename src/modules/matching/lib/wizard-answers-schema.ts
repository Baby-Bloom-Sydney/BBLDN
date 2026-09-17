// The boundary validator for `WizardAnswers` (01 §4a: validated once, at the boundary): what the wizard posts
// and what `parent_leads.form_data` reads back. Unknown keys are dropped; a malformed value fails the whole
// record — a lead that cannot be read is `null`, never a half-parsed position.
import { z } from "zod";
import type { WizardAnswers } from "../types";

const MAX_TEXT = 80;
const MAX_CHILDREN = 3;
const MAX_LIST = 12;

const text = z.string().trim().max(MAX_TEXT);
const day = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
const part = z.enum(["morning", "midday", "afternoon", "evening"]);

const WIZARD_ANSWERS_SCHEMA = z
  .object({
    children: z.array(z.object({ ageLabel: text })).max(MAX_CHILDREN),
    area: z.object({ area: text, district: text }),
    days: z.array(day).max(7),
    parts: z.array(part).max(4),
    scheduleType: z.enum(["Fixed", "Flexible"]),
    hoursPerWeek: text,
    placementLength: text,
    startWhen: text,
    focus: text,
    support: text,
    minExperienceYears: z.number().int().min(0).max(50),
    drivingLicence: z.boolean(),
    car: z.boolean(),
    nonSmoker: z.boolean(),
    petsAtHome: z.boolean(),
    languages: z.array(text).max(MAX_LIST),
    connectNannyId: text,
  })
  .partial()
  .strip();

export function parseWizardAnswers(raw: unknown): WizardAnswers | null {
  const parsed = WIZARD_ANSWERS_SCHEMA.safeParse(raw);
  return parsed.success ? (parsed.data as WizardAnswers) : null;
}
