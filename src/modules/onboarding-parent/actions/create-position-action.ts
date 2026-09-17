"use server";
// S-P-04 `/parent/request` — the in-app position flow's one server action (01 §4e), 04 §3.3 trigger (b): a
// parent who signed up cold, from a profile or from the quick match answers the same question bank and the
// position opens here. P-2's own cascade opens the call (C-a) and the parent lands on S-P-01 — which is why
// this action answers a destination and never renders one.
//
// Order, as 04 §3.1 step 6 states it: the signed-in parent (role gate, never a caller-supplied id), the profile
// facts P-2 carries, `advance(P-2)`, then `matching.autofire` after the commit (03 §7.4). A failed autofire
// never fails the position — the waves sweep of §7.4 re-fires it.
//
// **Done-for-you is not sold here (ADR-082 / 093).** The position form asks what the family needs; the paid
// path, the amounts and the guarantees are the call's (04 §3.1 step 13, D2) and appear on no pre-call screen.
import { auth } from "@/modules/auth";
import { positionDetailOf } from "@/modules/matching";
import { matching } from "@/modules/matching";
import { advance } from "@/modules/positions";
import { err, log, newId, ok, toActionResult } from "@/modules/platform";
import type { ClientResult } from "@/modules/platform";
import type { ParentId, PositionId, Result } from "@/modules/shared-types";
import { parentProfileStore } from "../lib/default-parent-profile-store";
import type { CreatePositionInput, PositionFlowOutcome } from "../types";
import { PARENT_CALL_PATH } from "../lib/parent-call-path";

const refused = (step: "no-profile" | "not-opened", cause: unknown) => {
  log.error("the position was not created", {
    module: "onboarding-parent",
    action: "createPosition",
    step,
    cause,
  });
  return err("INTERNAL", "We couldn't create your position just yet.");
};

async function createPosition(
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

  const profile = await parentProfileStore.get(session.value.userId);
  if (!profile.ok) return refused("no-profile", profile.error);
  if (profile.value === null) return refused("no-profile", "no profile row");

  const positionId = newId<PositionId>();
  const opened = await advance({
    entity: { kind: "position", id: positionId },
    transition: "P-2",
    actor,
    payload: {
      parentId: session.value.userId as string as ParentId,
      source: "in_app",
      detail,
      recipient: {
        email: profile.value.email,
        name: profile.value.firstName,
      },
      mobile: profile.value.mobile,
    },
    expectedFrom: null,
    idempotencyKey: `in-app-create:${positionId}`,
  });
  if (!opened.ok) return refused("not-opened", opened.error);

  const fired = await matching.autofire(positionId, actor);
  if (!fired.ok)
    log.warn("autofire after the in-app create failed", {
      module: "onboarding-parent",
      action: "createPosition",
      cause: fired.error,
    });
  return ok({ destination: PARENT_CALL_PATH });
}

export const createPositionAction = async (
  input: CreatePositionInput,
): Promise<ClientResult<PositionFlowOutcome>> =>
  toActionResult(await createPosition(input));
