// `nannies.qualification` (a ladder key or label) → the rung `scoring` reads (03 §7.1 "reads rungs, never
// names"). Matched against `MATCHING.qualificationLadder` by key, then by label, case-insensitive; unknown → 0.
import { MATCHING } from "@/modules/config";

export function qualificationRung(qualification: string | null): number {
  if (qualification === null) return 0;
  const needle = qualification.trim().toLowerCase();
  const rung = MATCHING.qualificationLadder.find(
    (entry) =>
      entry.key.toLowerCase() === needle ||
      entry.label.toLowerCase() === needle,
  );
  return rung?.rung ?? 0;
}
