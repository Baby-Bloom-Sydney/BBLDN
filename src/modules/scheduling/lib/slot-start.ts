// `SlotId` is `calendarId:startISO` and **never stored** (03 §3.2) — so reading one back is parsing, and
// parsing at a boundary is validation (01 §4a). I-5 lives here too: a `calendarId` that is not `'default'` is
// `CALENDAR_UNKNOWN`, not a slot on some other calendar.
import { ok } from "@/modules/platform";
import type { ISO, Result, SlotId } from "@/modules/shared-types";
import type { SchedulingErrorDetails } from "../types";
import { schedulingFailure } from "./scheduling-failure";

const PREFIX = "default:";

export function slotStart(slotId: SlotId): Result<ISO, SchedulingErrorDetails> {
  if (!slotId.startsWith(PREFIX))
    return schedulingFailure(undefined, "CALENDAR_UNKNOWN");
  const start = slotId.slice(PREFIX.length);
  const at = Date.parse(start);
  if (Number.isNaN(at)) return schedulingFailure(undefined, "CALENDAR_UNKNOWN");
  return ok(new Date(at).toISOString() as ISO);
}
