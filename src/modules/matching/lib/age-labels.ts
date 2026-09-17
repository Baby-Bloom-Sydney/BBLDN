// The child-age labels a parent picks from — `MATCHING.ageRangeToMonths`' keys (03 §7.3), so the wizard and the
// engine cannot disagree about a label.
import { MATCHING } from "@/modules/config";

export const AGE_LABELS: ReadonlyArray<string> = Object.freeze(
  Object.keys(MATCHING.ageRangeToMonths),
);
