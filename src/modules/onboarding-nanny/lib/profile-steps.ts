// S-N-18 — the ten steps of `03.17`, rejigged for London: right-to-work vocabulary is the funnel's, the area is
// a London district, the rate is in the config currency, the qualification is the DfE ladder (ADR-149). Every step names the form
// fields it saves so the action can parse exactly those and nothing else (01 §4a).
import type { ProfileStep } from "../types";

export const PROFILE_STEPS: ReadonlyArray<ProfileStep> = Object.freeze([
  { id: "location", heading: "Where in London are you?", fields: ["district", "area", "mobile"] },
  { id: "date-of-birth", heading: "Your date of birth", fields: ["dateOfBirth"] },
  { id: "experience", heading: "Your experience", fields: ["yearsExperience", "ageGroups"] },
  { id: "qualification", heading: "Your childcare qualification", fields: ["qualification"] },
  { id: "certificates", heading: "Certificates you hold", fields: ["certificates"] },
  { id: "languages", heading: "Languages you speak", fields: ["languages"] },
  {
    id: "practical",
    heading: "The practical things",
    fields: ["hasCar", "hasDrivingLicence", "isNonSmoker", "comfortableWithPets"],
  },
  { id: "availability", heading: "When you're available", fields: ["availability"] },
  { id: "rate", heading: "Your rate and start date", fields: ["hourlyRateMin", "availableFrom"] },
  { id: "about-you", heading: "About you", fields: ["bio"] },
]);
