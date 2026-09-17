// The funnel's answer lists (04 §4.1 rows 4–6; 04 §6.1 S-X-17). Vocabulary, not config: none of these is a
// brand, URL, price or flag (L4), and `matching`'s question bank keeps its options the same way. Labels are the
// screen's words (glossary §6 voice); keys are what the lead and profile rows store.
import type {
  NannyAgeGroup,
  NannyDayBlock,
  NannyRoleType,
  NannyRtwStatus,
  NannyWeekday,
} from "../types";

type Option<K extends string> = { readonly key: K; readonly label: string };

export const FUNNEL_OPTIONS = Object.freeze({
  /** 02 §3 `lead_rtw_status` in UK words (T-0.8). `unknown` is never offered — it is the column's default, not an answer. */
  rtwStatus: Object.freeze([
    { key: "citizen", label: "British or Irish citizen" },
    {
      key: "settled",
      label: "Settled or pre-settled status, or indefinite leave",
    },
    { key: "visa_with_rtw", label: "A visa that lets me work in the UK" },
    {
      key: "no_rtw",
      label: "I don't currently have the right to work in the UK",
    },
  ] as const satisfies ReadonlyArray<Option<NannyRtwStatus>>),
  ageGroups: Object.freeze([
    { key: "babies", label: "Babies (under 1)" },
    { key: "toddlers", label: "Toddlers (1–3)" },
    { key: "preschool", label: "Pre-school (3–5)" },
    { key: "school-age", label: "School age (5+)" },
  ] as const satisfies ReadonlyArray<Option<NannyAgeGroup>>),
  /** The under-3 signal 04 §4.1 row 5 captures and never shows her. */
  underThreeGroups: Object.freeze([
    "babies",
    "toddlers",
  ] as const satisfies ReadonlyArray<NannyAgeGroup>),
  roleTypes: Object.freeze([
    { key: "full-time", label: "Full-time" },
    { key: "part-time", label: "Part-time" },
    { key: "before-after-school", label: "Before and after school" },
    { key: "nanny-share", label: "Nanny share" },
    { key: "occasional", label: "Occasional days" },
  ] as const satisfies ReadonlyArray<Option<NannyRoleType>>),
  weekdays: Object.freeze([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ] as const satisfies ReadonlyArray<NannyWeekday>),
  dayBlocks: Object.freeze([
    "morning",
    "midday",
    "afternoon",
    "evening",
  ] as const satisfies ReadonlyArray<NannyDayBlock>),
  /** N3's rate-band edges, per hour (04 §6.1 S-X-17). */
  rate: Object.freeze({ minPerHour: 10, maxPerHour: 60 }),
  yearsExperience: Object.freeze({ min: 0, max: 60 }),
  bioMinLength: 40,
});
