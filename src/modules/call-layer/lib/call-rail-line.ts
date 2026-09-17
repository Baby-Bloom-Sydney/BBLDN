// 04 §7.1 row 3 — the one line the dashboard rail shows for the introduction call, per call state (ADR-073):
// "pick a time" while `awaiting-slot`, the London time while `slot-chosen`, "we'll try again" after a no-answer,
// "done" after C-3. `positions.getJourneySteps` (1e) composes row 3's `detail` with this so the rail and the call
// page never disagree about the words. No "book" anywhere on the rail (glossary §6 — the exception is the call
// page's button only).
import type { CallRailLineInput } from "../types";
import { londonSlotWords } from "./london-slot-words";

const LABEL = "Introduction call";

export function callRailLine(input: CallRailLineInput): string {
  if (input.state === "done") return `${LABEL} — done`;
  if (input.state === "slot-chosen" && input.slotStart !== undefined)
    return `${LABEL} — ${londonSlotWords(input.slotStart).short}`;
  if (input.afterNoAnswer === true) return `${LABEL} — we'll try again`;
  return `${LABEL} — pick a time`;
}
