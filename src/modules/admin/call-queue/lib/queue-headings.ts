// The five group headings of S-A-03, and their order down the page: what needs the admin now, then what is
// coming, then what is waiting on the family, then what is finished (04 §5.2 step 4 — "the call list sorts by
// booked time; `awaiting-slot` calls sit in their own group").
//
// Admin-facing wording, and still bound by 04 §5.1: never "sales call", "consultation" or "offer" anywhere,
// "including admin-facing labels that could leak into parent-facing copy".
import type { CallQueueGroupName } from "../types";

export const QUEUE_HEADINGS: ReadonlyArray<{
  readonly name: CallQueueGroupName;
  readonly heading: string;
}> = Object.freeze([
  { name: "overdue", heading: "Overdue" },
  { name: "due", heading: "Due now" },
  { name: "upcoming", heading: "Upcoming" },
  { name: "awaiting-slot", heading: "Waiting for a time" },
  { name: "done", heading: "Done" },
]);
