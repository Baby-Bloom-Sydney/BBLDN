// Layer 1, schedule (03 §7.2): coverage = requested blocks the nanny also has ÷ requested blocks; `null`
// schedule = full marks; `Flexible` multiplies coverage by `flexibleBoost` (capped at 1); the coverage runs
// through `scheduleCurve` (first row whose `minCoveragePct` the coverage meets).
import type { MatchingConfig, Schedule, ScheduleBlock } from "../../types";

const FULL = 100;

const keyOf = (block: ScheduleBlock): string => `${block.day}:${block.part}`;

export function scoreSchedule(
  requested: Schedule,
  availability: ReadonlyArray<ScheduleBlock>,
  config: MatchingConfig,
): { readonly score: number; readonly overlapPct: number | null } {
  if (requested === null || requested.blocks.length === 0)
    return { score: FULL, overlapPct: null };
  const have = new Set(availability.map(keyOf));
  const matched = requested.blocks.filter((block) => have.has(keyOf(block)));
  const raw = matched.length / requested.blocks.length;
  const coverage =
    requested.type === "Flexible"
      ? Math.min(1, raw * config.flexibleBoost)
      : raw;
  const overlapPct = Math.round(coverage * FULL);
  const row =
    config.scheduleCurve.find((entry) => overlapPct >= entry.minCoveragePct) ??
    config.scheduleCurve.at(-1);
  return { score: row?.points ?? 0, overlapPct };
}
