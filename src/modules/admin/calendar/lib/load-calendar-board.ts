// S-A-03's calendar read (04 §6.4; ADR-074). Every slot the admin has open across the booking horizon, plus the
// ADR-076 rules as they actually stand.
//
// The rules are read as `matchmaking` availability on purpose: it is the supply a family sees, which is what an
// admin looking at her own calendar wants to know. A nanny's view is narrower (she is never shown a
// displaceable slot, I-2) and is not the admin's view of her own week.
import { SCHEDULING } from "@/modules/config";
import { scheduling } from "@/modules/scheduling";
import type { ISO } from "@/modules/shared-types";
import type { CalendarRead } from "../types";
import { calendarDays } from "./calendar-days";

const DAY_MS = 86_400_000;

export async function loadCalendarBoard(): Promise<CalendarRead> {
  const now = Date.now();
  const slots = await scheduling.getAvailableSlots({
    kind: "matchmaking",
    from: new Date(now).toISOString() as ISO,
    to: new Date(now + SCHEDULING.horizonDays * DAY_MS).toISOString() as ISO,
  });
  if (!slots.ok)
    return slots.error.code === "FORBIDDEN"
      ? { kind: "forbidden" }
      : { kind: "unavailable" };
  return {
    kind: "calendar",
    view: Object.freeze({
      days: calendarDays(slots.value),
      rules: Object.freeze({
        slotMinutes: SCHEDULING.slotMinutes,
        openFrom: SCHEDULING.hours.startLocal,
        openTo: SCHEDULING.hours.endLocal,
        weekdays: "Monday to Friday",
        horizonDays: SCHEDULING.horizonDays,
        leadTimeMinutes: SCHEDULING.leadTimeMinutes,
        holdMinutes: SCHEDULING.holdTtlSeconds / 60,
      }),
      unblockUnavailable: true,
    }),
  };
}
