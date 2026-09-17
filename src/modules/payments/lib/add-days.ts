// Whole days onto an `Instant` (UTC arithmetic; the windows in `PRICES` are day counts, not London dates).
import type { Instant } from "@/modules/shared-types";

const MS_PER_DAY = 86_400_000;

export function addDays(from: Instant, days: number): Instant {
  return new Date(
    new Date(from).getTime() + days * MS_PER_DAY,
  ).toISOString() as Instant;
}
