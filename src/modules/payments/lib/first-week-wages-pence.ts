// ADR-100: the first-week discount is the nanny's contracted first week, capped at `OFFER.firstWeekMaxHours`
// hours and `OFFER.firstWeekMaxRatePence` per hour — hours and rate come from the placement's contract, never
// from the parent. A placement with no contracted terms yields no discount rather than a guessed one.
import { OFFER } from "@/modules/config";
import type { PlacementTerms } from "./spine-store";

export function firstWeekWagesPence(terms: PlacementTerms | null): number {
  if (terms === null) return 0;
  const hours = terms.weeklyHours ?? 0;
  const rate = terms.hourlyRatePence ?? 0;
  if (hours <= 0 || rate <= 0) return 0;
  return (
    Math.min(hours, OFFER.firstWeekMaxHours) *
    Math.min(rate, OFFER.firstWeekMaxRatePence)
  );
}
