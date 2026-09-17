// Layer 1, location (03 §7.1 / §7.5): km → points through `DISTANCE_BRACKETS`; beyond the last bracket → 0;
// `null` (distance unknown) → `unknownDistancePoints`; a car applies `carDistanceMultiplier`, capped at 100.
import type { MatchingConfig } from "../../types";

const MAX_POINTS = 100;

export function scoreLocation(
  distanceKm: number | null,
  hasCar: boolean,
  config: MatchingConfig,
): number {
  if (distanceKm === null) return config.unknownDistancePoints;
  const bracket = config.DISTANCE_BRACKETS.find(
    (entry) => distanceKm <= entry.maxKm,
  );
  const base = bracket?.points ?? 0;
  const withCar = hasCar ? base * config.carDistanceMultiplier : base;
  return Math.min(MAX_POINTS, Math.round(withCar));
}
