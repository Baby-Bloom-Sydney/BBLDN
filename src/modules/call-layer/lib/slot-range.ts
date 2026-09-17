// The window S-P-02 asks the calendar for: from now to `horizonDays` ahead (ADR-076; `config/scheduling.ts`).
// The lead time and the grid are the calendar's own rule (03 §3.3 I-7); this only bounds the read.
import { SCHEDULING } from "@/modules/config";
import type { ISO } from "@/modules/shared-types";

const DAY_MS = 86_400_000;

export function slotRange(now: ISO): {
  readonly from: ISO;
  readonly to: ISO;
} {
  const start = Date.parse(now);
  return Object.freeze({
    from: now,
    to: new Date(start + SCHEDULING.horizonDays * DAY_MS).toISOString() as ISO,
  });
}
