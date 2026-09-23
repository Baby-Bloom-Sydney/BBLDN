// The stages at which the family herself still owns what she asked for — the ruling recorded in the L-007
// PROGRESS entry, in one place so the screen that shows the link and the method that performs the write read the
// same set.
//
// A parent edits **before anyone has been put in front of her**: `DRAFT` and `OPEN`. `CONNECTING` is what
// 04 §3.1 step 14 writes immediately after the introduction call, with meetings arranged on the terms she gave
// and no mechanism to re-tell the nanny they changed; `ACTIVE` has a nanny placed, and the hours, rate and start
// a family renegotiates there live on the **placement**, which has its own `amend`. So the line the stage model
// already draws is the line, and past it the matchmaker makes the change — she is an `admin` actor and is not
// stage-gated. The parent is not stuck: P-7 (close) is hers at DRAFT / OPEN / CONNECTING, P-6 (end) at ACTIVE.
//
// Sydney gates neither: a parent there may edit a filled position, silently, and nobody who agreed to the old
// terms is told. That is evidence of what happens without the line, not an argument for copying it.
import type { PositionStage } from "@/modules/shared-types";

export const PARENT_AMENDABLE_STAGES: ReadonlySet<PositionStage> = new Set([
  "DRAFT",
  "OPEN",
] as const);
