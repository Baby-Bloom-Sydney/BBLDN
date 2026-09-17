// One `availability_rules` row (02 §4.4 row 2) → 03 §3.2's `AvailabilityRule`. Two shapes differ: the column is
// a Postgres `time` (`HH:MM:SS`), the contract is `HH:mm`; and `weekday` is `0–6` with **Monday = 0**, which is
// 02 §4.4's convention and the one ADR-118 (c) made authoritative. `config/scheduling.ts`'s seed array still
// comments itself as `0 = Sunday` — a recorded foundations gap, not reconciled here (`generate-slots.ts` carries
// the same note).
import type {
  AvailabilityRule,
  LocalTime,
  RuleId,
  Weekday,
} from "@/modules/shared-types";
import type { AvailabilityRuleRow } from "../types";

export function ruleFromRow(row: AvailabilityRuleRow): AvailabilityRule {
  return Object.freeze({
    id: row.id as RuleId,
    weekday: row.weekday as Weekday,
    startLocal: row.start_time.slice(0, 5) as LocalTime,
    endLocal: row.end_time.slice(0, 5) as LocalTime,
    ...(row.effective_from === null
      ? {}
      : {
          effectiveFrom:
            row.effective_from as AvailabilityRule["effectiveFrom"],
        }),
    ...(row.effective_to === null
      ? {}
      : { effectiveTo: row.effective_to as AvailabilityRule["effectiveTo"] }),
  });
}
