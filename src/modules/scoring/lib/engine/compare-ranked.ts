// 03 §7.3 ordering: score desc, then distance asc (unknown last), then `nannyId` — deterministic.
import type { Ranked } from "../../types";

export function compareRanked(left: Ranked, right: Ranked): number {
  return (
    right.score - left.score ||
    (left.distanceKm ?? Number.POSITIVE_INFINITY) -
      (right.distanceKm ?? Number.POSITIVE_INFINITY) ||
    left.nannyId.localeCompare(right.nannyId)
  );
}
