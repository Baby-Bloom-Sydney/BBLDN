// The front door's days × parts → a `scoring` `Schedule` (03 §7.2). No day or no part chosen = `null` = full
// marks: the parent has not constrained the schedule, so location alone ranks.
import type { Schedule } from "@/modules/scoring";
import type { QuickMatchInput } from "../types";

export function quickMatchSchedule(
  input: Pick<QuickMatchInput, "days" | "parts">,
): Schedule {
  if (input.days.length === 0 || input.parts.length === 0) return null;
  return Object.freeze({
    type: "Fixed" as const,
    blocks: Object.freeze(
      input.days.flatMap((day) => input.parts.map((part) => ({ day, part }))),
    ),
  });
}
