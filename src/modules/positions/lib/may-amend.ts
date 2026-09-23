// Who may amend a position, and when. `amend()` moves facts **without** a transition (03 §2.2), so it is not in
// `POSITION_TRANSITIONS` and `allowedTransitions` cannot answer for it — this asks the same two questions where
// the amend happens.
//
// **The actor rule is 03 §2.5's, unchanged:** a parent acts only on her own position. `amend` had no actor check
// at all before this unit, which meant any signed-in parent could rewrite any family's position the moment a
// caller existed; the check is the same one `create-positions-slice.ts` applies to every P row.
//
// **The stage rule is `parent-amendable-stages.ts`'**, which carries the ruling and its reasons.
import { err, ok } from "@/modules/platform";
import type {
  Actor,
  ParentId,
  PositionStage,
  Result,
} from "@/modules/shared-types";
import type { StageErrorDetails } from "../types";
import { PARENT_AMENDABLE_STAGES } from "./parent-amendable-stages";

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
