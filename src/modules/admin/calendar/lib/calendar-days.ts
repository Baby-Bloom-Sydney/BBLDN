// The slot list laid out as the days S-A-03 renders (04 §6.4: an APG date-grid — arrow keys by slot and by
// day). Wording comes from `call-layer`'s `londonSlotWords`, so the admin's calendar and the parent's picker
// never disagree about what "Friday 9 January, 10:00am London time" means.
//
// The grouping is done here rather than through `groupSlotsByDay` for one reason: that helper returns
// `SlotOption`, which drops `displaceable` — and `displaceable` is exactly what the admin needs to see, because
// it is the difference between a free slot and a nanny's slot that a family booking would move (I-2).
import { LOCALE } from "@/modules/config";
import { londonSlotWords } from "@/modules/call-layer";
import type { Slot } from "@/modules/shared-types";
import type { CalendarCell, CalendarDay } from "../types";

const LONDON_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: LOCALE.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const cellOf = (slot: Slot): CalendarCell => {
  const words = londonSlotWords(slot.start);
  return Object.freeze({
    slotId: slot.id,
    start: slot.start,
    time: words.time,
    state: slot.displaceable ? ("displaceable" as const) : ("open" as const),
    label: slot.displaceable
      ? `${words.full} — a nanny holds this; a family booking moves her`
      : words.full,
  });
};

export function calendarDays(
  slots: ReadonlyArray<Slot>,
): ReadonlyArray<CalendarDay> {
  const byDate = new Map<string, Array<Slot>>();
  for (const slot of [...slots].sort((left, right) =>
    left.start.localeCompare(right.start),
  )) {
    const date = LONDON_DATE.format(new Date(slot.start));
    byDate.set(date, [...(byDate.get(date) ?? []), slot]);
  }
  return Object.freeze(
    [...byDate.entries()].map(([date, daySlots]) =>
      Object.freeze({
        date,
        legend: `${londonSlotWords(daySlots[0].start).weekday} ${londonSlotWords(daySlots[0].start).date}`,
        slots: Object.freeze(daySlots.map(cellOf)),
      }),
    ),
  );
}
