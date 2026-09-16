// The four parts of a day the front door asks about — `scoring`'s `ScheduleBlock.part` values (03 §7.2), with the
// London hours a parent reads beside each.
import type { QuickMatchPart } from "../types";

export const QUICK_MATCH_PARTS: ReadonlyArray<{
  readonly value: QuickMatchPart;
  readonly label: string;
  readonly hours: string;
}> = Object.freeze([
  { value: "morning", label: "Morning", hours: "6am – 10am" },
  { value: "midday", label: "Midday", hours: "10am – 2pm" },
  { value: "afternoon", label: "Afternoon", hours: "2pm – 6pm" },
  { value: "evening", label: "Evening", hours: "6pm – 10pm" },
]);
