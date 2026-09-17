// Calendar months onto an `Instant` — the period of one instalment of the `instalments{X}` shape (03 §5.2:
// "X monthly payments"). A month is the shape's own unit, not a tunable, which is why it is not in `PRICES`.
import type { Instant } from "@/modules/shared-types";

export function addMonths(from: Instant, months: number): Instant {
  const date = new Date(from);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString() as Instant;
}
