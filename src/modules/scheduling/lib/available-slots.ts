// 03 §3.1 "rules + blocks − active bookings, computed at read", as one pure function so the db inside and the
// stub answer the same thing. Precedence is 02 §4.4 row 3's: **blocked > open > rule** — an `open` row adds a
// grid over its own range even where no rule reaches, and a `blocked` row wins over both.
//
// `displaceable` (03 §3.2) is the parent's view of a slot a nanny holds: shown to a parent, never to a nanny,
// and only while the I-13 cap still has room.
import type { ISO, Slot, SlotId } from "@/modules/shared-types";
import type { AvailableSlotsInput } from "../types";
import { generateSlots } from "./generate-slots";

const MINUTE_MS = 60_000;

const gridOver = (
  start: ISO,
  end: ISO,
  slotMinutes: number,
): ReadonlyArray<Slot> => {
  const step = slotMinutes * MINUTE_MS;
  const last = Date.parse(end);
  const slots: Array<Slot> = [];
  for (let at = Date.parse(start); at + step <= last; at += step) {
    const from = new Date(at).toISOString() as ISO;
    slots.push({
      id: `default:${from}` as SlotId,
      calendarId: "default",
      start: from,
      end: new Date(at + step).toISOString() as ISO,
      displaceable: false,
    });
  }
  return slots;
};

const covers = (
  range: { readonly start: ISO; readonly end: ISO },
  slot: Slot,
): boolean => slot.start < range.end && slot.end > range.start;

export function availableSlots(
  input: AvailableSlotsInput,
): ReadonlyArray<Slot> {
  // A nanny never displaces (I-2), so a nanny-commission caller is shown only what nobody holds.
  const mayDisplace = input.kind !== "nanny-commission";
  const generated = [
    ...generateSlots({
      rules: input.rules,
      from: input.from,
      to: input.to,
      slotMinutes: input.slotMinutes,
    }),
    ...input.opens.flatMap((open) =>
      gridOver(open.start, open.end, input.slotMinutes).filter(
        (slot) => slot.start >= input.from && slot.start <= input.to,
      ),
    ),
  ];
  const seen = new Set<string>();
  return generated
    .filter((slot) => {
      if (seen.has(slot.start)) return false;
      seen.add(slot.start);
      return !input.blocks.some((block) => covers(block, slot));
    })
    .flatMap((slot) => {
      const taken = input.occupied.get(slot.start);
      if (taken === undefined) return [slot];
      if (!taken.nanny || !mayDisplace) return [];
      // I-13: at the cap her slot is no longer displaceable — it reads as taken.
      if (taken.displacementsToday >= input.displacementCap) return [];
      return [Object.freeze({ ...slot, displaceable: true })];
    })
    .sort((left, right) => left.start.localeCompare(right.start));
}
