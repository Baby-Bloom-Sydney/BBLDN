/**
 * Prose helpers for the DFY job-match tile + Katie job-search module.
 * Survivors of `bsr-translator.ts`, which went with the babysitting line at S1
 * (SEQUENCE 07.28, N-1); nothing here is babysitting-specific.
 */

export function distanceText(km: number | null): string {
  if (km == null || !Number.isFinite(km)) return "distance unknown";
  if (km < 1) return "<1 km";
  return `${km.toFixed(1)} km`;
}

export function childrenSummary(
  children: Array<{ age_months: number; gender: string | null }>,
): string {
  if (children.length === 0) return "No child details";
  const parts = children.map((c) => {
    if (c.age_months < 12) {
      return `${c.age_months} month${c.age_months === 1 ? "" : "s"}`;
    }
    const years = Math.floor(c.age_months / 12);
    return `${years} year${years === 1 ? "" : "s"}`;
  });
  const noun =
    children.length === 1 ? "1 child" : `${children.length} children`;
  return `${noun} (${parts.join(", ")})`;
}
