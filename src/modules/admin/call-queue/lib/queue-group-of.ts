// Which group of S-A-03 a row belongs to (04 §6.4: "due now · overdue · upcoming · awaiting-slot · done").
//
// `due` comes from `scheduling` and is computed at read from `now` (I-12; ADR-070) — nothing here recomputes
// it. The one thing this adds is the `awaiting-slot` group: a `no-answer` row is a call the parent still owes a
// time, so it sits with the calls waiting for one rather than with the finished ones (R5; ADR-073).
import type { CallListItem } from "@/modules/shared-types";
import type { CallQueueGroupName } from "../types";

export function queueGroupOf(item: CallListItem): CallQueueGroupName {
  if (item.booking.status === "no-answer") return "awaiting-slot";
  if (item.due === "past") return "done";
  return item.due;
}
