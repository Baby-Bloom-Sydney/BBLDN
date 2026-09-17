// 03 §3.2 I-5 — one calendar. `'default'` is the only `CalendarId` the contract admits, and 02 §4.4 row 1 holds
// exactly one row; this is where the two meet. The **stored** values win over `config/scheduling.ts`'s seed,
// because ADR-076 says all of them are "editable in the admin at any time" and a config constant is not.
import { ok } from "@/modules/platform";
import type { Result, Uuid } from "@/modules/shared-types";
import type {
  ResolvedCalendar,
  SchedulingErrorDetails,
  SchedulingReads,
} from "../types";
import { schedulingFailure } from "./scheduling-failure";

export async function resolveCalendar(
  reads: SchedulingReads,
): Promise<Result<ResolvedCalendar, SchedulingErrorDetails>> {
  const row = await reads.calendar();
  if (!row.ok) return schedulingFailure(row.error);
  if (row.value === null)
    return schedulingFailure(undefined, "CALENDAR_UNKNOWN");
  return ok(
    Object.freeze({
      id: row.value.id as Uuid,
      slotMinutes: row.value.slot_minutes,
      horizonDays: row.value.booking_horizon_days,
      leadTimeMinutes: row.value.lead_time_minutes,
      holdTtlSeconds: row.value.hold_minutes * 60,
    }),
  );
}
