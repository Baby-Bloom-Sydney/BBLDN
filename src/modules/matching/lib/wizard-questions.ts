// S-X-03's question bank (04 §3.1 step 3: children, ages, area + district, hours, days, length, focus …), one
// question per screen; S-P-04 reuses it (04 §6.2 "same question bank as S-X-03"). Copy is a parent's, written
// for London against 00-glossary §6 / P-4. Age labels are `MATCHING.ageRangeToMonths`' keys (03 §7.3), so the
// engine and the screen cannot disagree about a label.
import type { WizardAnswers } from "../types";

export type WizardQuestion = {
  readonly id: keyof WizardAnswers | "children-ages";
  readonly heading: string;
  readonly help?: string;
  readonly kind:
    "children" | "area" | "days-times" | "single" | "multi" | "yes-no";
  readonly options?: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
  readonly optional?: true;
};

const opts = (
  values: ReadonlyArray<string>,
): ReadonlyArray<{ readonly value: string; readonly label: string }> =>
  Object.freeze(values.map((value) => ({ value, label: value })));

export const WIZARD_QUESTIONS: ReadonlyArray<WizardQuestion> = Object.freeze([
  {
    id: "children",
    heading: "Who will your nanny care for?",
    help: "Add each child and their age.",
    kind: "children",
  },
  {
    id: "area",
    heading: "Where in London are you?",
    help: "Your area and the first part of your postcode.",
    kind: "area",
  },
  {
    id: "days",
    heading: "Which days and times do you need?",
    kind: "days-times",
  },
  {
    id: "scheduleType",
    heading: "Are those days fixed, or can they move?",
    kind: "single",
    options: Object.freeze([
      { value: "Fixed", label: "Fixed — the same every week" },
      { value: "Flexible", label: "Flexible — they can move around" },
    ]),
  },
  {
    id: "hoursPerWeek",
    heading: "Roughly how many hours a week?",
    kind: "single",
    options: opts(["Under 15", "15–25", "25–40", "40 or more"]),
  },
  {
    id: "placementLength",
    heading: "How long do you need a nanny for?",
    kind: "single",
    options: opts([
      "A few months",
      "Six months to a year",
      "A year or more",
      "Ongoing",
    ]),
  },
  {
    id: "startWhen",
    heading: "When would you like to start?",
    kind: "single",
    options: opts([
      "As soon as possible",
      "Within a month",
      "In one to three months",
      "Later",
    ]),
  },
  {
    id: "focus",
    heading: "What matters most to you in a nanny?",
    kind: "single",
    options: opts([
      "Early development and learning",
      "Warmth and everyday care",
      "Routine and structure",
      "Help around the home too",
    ]),
  },
  {
    id: "support",
    heading: "How much support would you like from your nanny?",
    kind: "single",
    options: opts([
      "Everyday care",
      "Care plus activities",
      "Care, activities and learning",
    ]),
  },
  {
    id: "minExperienceYears",
    heading: "How much experience should your nanny have?",
    kind: "single",
    options: Object.freeze([
      { value: "0", label: "Any" },
      { value: "1", label: "A year or more" },
      { value: "3", label: "Three years or more" },
      { value: "5", label: "Five years or more" },
    ]),
  },
  {
    id: "drivingLicence",
    heading: "Does your nanny need a driving licence?",
    kind: "yes-no",
  },
  { id: "car", heading: "Does your nanny need her own car?", kind: "yes-no" },
  {
    id: "nonSmoker",
    heading: "Does your nanny need to be a non-smoker?",
    kind: "yes-no",
  },
  {
    id: "petsAtHome",
    heading: "Do you have pets at home?",
    help: "So we can match you with a nanny who is comfortable with them.",
    kind: "yes-no",
  },
  {
    id: "languages",
    heading: "Any languages your nanny should speak?",
    help: "Leave empty if English is all you need.",
    kind: "multi",
    optional: true,
    options: opts([
      "French",
      "Spanish",
      "Portuguese",
      "Italian",
      "German",
      "Polish",
      "Arabic",
      "Urdu",
      "Hindi",
      "Mandarin",
    ]),
  },
]);
