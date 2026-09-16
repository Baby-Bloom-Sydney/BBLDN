// 03 §3.6 — "the next free slot at or after a given start", the pure half of the I-2 / I-3 displacement move.
// The stub and the real inside share it so "next free" means one thing.
import type { ISO, Slot } from "@/modules/shared-types";

export function nextFreeSlot(
  slots: ReadonlyArray<Slot>,
  atOrAfter: ISO,
  taken: ReadonlySet<string>,
): Slot | null {
  return (
    [...slots]
      .sort((left, right) => left.start.localeCompare(right.start))
      .find((slot) => slot.start >= atOrAfter && !taken.has(slot.start)) ?? null
  );
}
