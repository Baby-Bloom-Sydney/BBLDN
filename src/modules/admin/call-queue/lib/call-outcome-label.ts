// 03 §2.7's outcome enum as the admin reads it. The vocabulary is the enum's, not this file's (04 §5.3 row
// "Call outcome vocabulary" points at `09.23`, which is this unit) — and the labels stay service-first per
// 04 §5.1: what happens next for the family, never whether anything was sold.
import type { CallOutcome } from "@/modules/shared-types";

export const CALL_OUTCOME_LABEL: Readonly<Record<CallOutcome, string>> =
  Object.freeze({
    proceeding: "Going ahead",
    "not-now": "Not right now",
    "not-proceeding": "Not going ahead",
    "no-answer": "No answer",
    cancelled: "Cancelled",
  });
