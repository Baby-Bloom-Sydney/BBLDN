// 04 §7.1 — the rail labels by glossary §1.4 row, as the rail shows them: rows 5 and 8 are folded into 4 and 7
// (§10 item 9), so six labels carry eight rows. A step is never hidden (P-2), so when the read fails these
// labels still render, with no state beside them.
import type { JourneyStep } from "@/modules/shared-types";

export const RAIL_LABELS: ReadonlyArray<{
  readonly row: JourneyStep["row"];
  readonly label: string;
}> = Object.freeze([
  { row: 1, label: "Matches" },
  { row: 2, label: "Nannies pre-checked" },
  { row: 3, label: "Introduction call" },
  { row: 4, label: "Meetings" },
  { row: 6, label: "Hire" },
  { row: 7, label: "Your app" },
]);
