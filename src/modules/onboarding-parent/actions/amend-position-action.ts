"use server";
// S-P-04's **edit** state (04 §6.2 — S-P-05 exits to "S-P-04 (edit)"; the screen's states are
// "new · edit (no re-fire) · prefilled"). The same question bank, the same mapping, the same module boundary as
// `createPositionAction` — the only differences are `amend` instead of `advance(P-2)`, and **no `autofire`**.
//
// It lives here rather than in `positions` for the reason `createPositionAction` does: the answers → detail
// mapping is `matching`'s (`positionDetailOf`), and `positions` may never import `matching` (01 §2.3; fix:
// A-1 / R2). `onboarding-parent` may import both, and already owns the screen's other action.
//
// **The position is found, never supplied.** The action takes answers and nothing else: the parent's live
// position is read from her session through `positions.findLive`, so no caller can name a position id. The
// actor rule and the stage gate inside `amend` are the second line, not the first.
//
// **The idempotency key is fresh each time, on purpose.** A second edit is a second real change and must land;
// re-sending the same key would make it a no-op. The double-submit guard is `0019`'s `p_expected_version` —
// `amend` writes `version + 1` of the row it read, so two racing amends cannot both commit (02 C-9).
import { positionDetailOf } from "@/modules/matching";
import { positions } from "@/modules/positions";
import { err, log, newId, ok, toActionResult } from "@/modules/platform";
import type { ClientResult } from "@/modules/platform";
import { auth } from "@/modules/auth";
import type { ParentId, Result } from "@/modules/shared-types";
import type { CreatePositionInput, PositionFlowOutcome } from "../types";
import { PARENT_POSITION_PATH } from "../lib/parent-position-path";

async function amendPosition(
  input: CreatePositionInput,
): Promise<Result<PositionFlowOutcome>> {
  const session = await auth.requireRole("parent");
  if (!session.ok) return session;
  const actor = {
    kind: "user",
    id: session.value.userId,
    role: "parent",
  } as const;

  const detail = positionDetailOf(input.answers);
  if (detail === null)
    return err("VALIDATION", "Tell us your London area before we go on.", {
      reason: "invalid-input" as const,
      field: "area",
    });

  const live = await positions.findLive(
    session.value.userId as string as ParentId,
  );
  if (!live.ok) {
    log.error("the position could not be read for an edit", {
      module: "onboarding-parent",
      action: "amendPosition",
      cause: live.error,
    });
    return err("INTERNAL", "We couldn't save your changes just yet.");
  }
  if (live.value === null)
    return err("NOT_FOUND", "You don't have a position to change yet.");

  // `amend` refuses a parent past `OPEN` itself; its message is the one the family reads.
  const amended = await positions.amend({
    entity: { kind: "position", id: live.value.positionId },
    actor,
    fields: { detail },
    idempotencyKey: `parent-amend:${live.value.positionId}:${newId()}`,
  });
  if (!amended.ok) return amended;
  return ok({ destination: PARENT_POSITION_PATH });
}

export const amendPositionAction = async (
  input: CreatePositionInput,
): Promise<ClientResult<PositionFlowOutcome>> =>
  toActionResult(await amendPosition(input));
