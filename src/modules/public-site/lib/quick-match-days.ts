// The seven days the front door asks about, valued 0–6 with Monday = 0 (02 §4.4; ADR-118 (c) — the side
// `config/scheduling.ts` still has to be corrected to). Labels are what a parent reads.
import type { QuickMatchDay } from "../types";

export const QUICK_MATCH_DAYS: ReadonlyArray<{
  readonly value: QuickMatchDay;
  readonly label: string;
  readonly short: string;
}> = Object.freeze([
  { value: 0, label: "Monday", short: "Mon" },
  { value: 1, label: "Tuesday", short: "Tue" },
  { value: 2, label: "Wednesday", short: "Wed" },
  { value: 3, label: "Thursday", short: "Thu" },
  { value: 4, label: "Friday", short: "Fri" },
  { value: 5, label: "Saturday", short: "Sat" },
  { value: 6, label: "Sunday", short: "Sun" },
]);
