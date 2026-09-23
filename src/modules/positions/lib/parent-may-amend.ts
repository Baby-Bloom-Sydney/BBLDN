// `PARENT_AMENDABLE_STAGES` as a predicate, for a screen deciding which of its two states it is in (04 §6.2:
// S-P-04 is "new" or "edit"). The same rule `mayAmend` enforces, so the link a parent is shown and the write she
// then makes cannot disagree about whether she may.
import type { PositionStage } from "@/modules/shared-types";
import { PARENT_AMENDABLE_STAGES } from "./parent-amendable-stages";

export const parentMayAmend = (stage: PositionStage): boolean =>
  PARENT_AMENDABLE_STAGES.has(stage);
