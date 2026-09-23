// Who may amend a position, and when. `amend()` moves facts **without** a transition (03 §2.2), so it is not in
// `POSITION_TRANSITIONS` and `allowedTransitions` cannot answer for it — this is the same two questions asked
// where the amend happens.
//
// **The actor rule is 03 §2.5's, unchanged:** a parent acts only on her own position. `amend` had no actor check
// at all before this unit, which meant any signed-in parent could rewrite any family's position; the check is
// the same one `create-positions-slice.ts` applies to every P row.
//
// **The stage rule is the ruling recorded in the L-007 PROGRESS entry.** A parent edits before anyone has been
// put in front of her — `DRAFT` and `OPEN`. `CONNECTING` is what 04 §3.1 step 14 writes immediately after the
// introduction call, with meetings arranged on the terms she gave and no mechanism to re-tell the nanny they
// changed; `ACTIVE` has a nanny placed, and the hours, rate and start a family renegotiates there live on the
// **placement**, which has its own `amend`. So the line the stage model already draws is the line, and past it
// the matchmaker makes the change — she is an `admin` actor and is not stage-gated. The parent is not stuck:
// P-7 (close) is hers at DRAFT / OPEN / CONNECTING and P-6 (end) at ACTIVE.
//
// Sydney gates neither: a parent there may edit a filled position, silently, and nobody who agreed to the old
// terms is told. That is evidence of what happens without the line, not an argument for copying it.
import { err, ok } from "@/modules/platform";
import type {
  Actor,
  ParentId,
  PositionStage,
  Result,
} from "@/modules/shared-types";
import type { StageErrorDetails } from "../types";

/** The stages at which the family herself still owns what she asked for. */
export const PARENT_AMENDABLE_STAGES: ReadonlySet<PositionStage> = new Set([
  "DRAFT",
  "OPEN",
] as const);

const refuse = (
  code: "FORBIDDEN" | "CONFLICT",
  message: string,
  reason: StageErrorDetails["reason"],
  which: string,
) =>
  err(code, message, {
    reason,
    entity: "position" as const,
    which,
  } satisfies StageErrorDetails);

export function mayAmend(
  actor: Actor,
  owner: ParentId,
  stage: PositionStage,
): Result<void, StageErrorDetails> {
  if (actor.kind === "user") {
    if (actor.role !== "parent")
      return refuse(
        "FORBIDDEN",
        "This is not your position to change.",
        "E_ACTOR_FORBIDDEN",
        "role",
      );
    if ((actor.id as string) !== (owner as string))
      return refuse(
        "FORBIDDEN",
        "This is not your position to change.",
        "E_ACTOR_FORBIDDEN",
        "owner",
      );
    if (!PARENT_AMENDABLE_STAGES.has(stage))
      return refuse(
        "CONFLICT",
        "Your matchmaker will make this change for you — she's already working on your meetings.",
        "E_PRECONDITION_FAILED",
        "stage",
      );
  }
  return ok(undefined);
}
