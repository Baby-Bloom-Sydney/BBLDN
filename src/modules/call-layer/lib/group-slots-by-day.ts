// S-P-02 — the calendar's slots grouped by London day, in order, each day a `fieldset` with the full date as
// its `legend` and each option named in full (04 §6.2 S-P-02 semantics; fix: a11y-2 / a11y-3). A day with no
// free slot is simply absent: "none this day → next day with slots".
import { LOCALE } from "@/modules/config";
import type { ISODate, Slot } from "@/modules/shared-types";
import type { SlotDay, SlotOption } from "../types";
import { londonSlotWords } from "./london-slot-words";

const LONDON_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: LOCALE.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const londonDate = (iso: string): ISODate =>
  LONDON_DATE.format(new Date(iso)) as ISODate;

const toOption = (slot: Slot): SlotOption => {
  const words = londonSlotWords(slot.start);
  return Object.freeze({
    id: slot.id,
    start: slot.start,
    end: slot.end,
    time: words.time,
    name: words.full,
  });
};

export function groupSlotsByDay(
  slots: ReadonlyArray<Slot>,
): ReadonlyArray<SlotDay> {
  const sorted = [...slots].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
  const days = sorted.reduce<ReadonlyArray<SlotDay>>((acc, slot) => {
    const isoDate = londonDate(slot.start);
    const last = acc.at(-1);
    if (last !== undefined && last.isoDate === isoDate) {
      const grown: SlotDay = {
        ...last,
        slots: [...last.slots, toOption(slot)],
      };
      return [...acc.slice(0, -1), grown];
    }
    const words = londonSlotWords(slot.start);
    return [
      ...acc,
      {
        isoDate,
        legend: `${words.weekday} ${words.date}`,
        slots: [toOption(slot)],
      },
    ];
  }, []);
  return Object.freeze(days.map((day) => Object.freeze(day)));
}
