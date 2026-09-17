// 03 §5.4.4 — `startTrial` on the family's **first** child, self-serve only (ADR-068 / 093).
//
// Three things this deliberately does not do:
//   1. It does not decide who is done-for-you. `payments` owns that (`E_DFY_FAMILY`, read off the placement and
//      the standing), and duplicating the test here would give the product two answers to one question.
//   2. It does not treat `{ alreadyUsed: true }` as a failure. It is the ordinary answer for a family that has
//      had its 30 days, and 03 §5.3 says so.
//   3. It does not gate on the count itself beyond "this is the first" — the RPC `start_family_trial_if_first`
//      is idempotent and once-per-parent-for-life (I-M6), so a second call is safe and this check is the cheap
//      half of a belt-and-braces pair rather than the rule.
//
// Like the access window, it fails soft: a child is added and a nanny is linked whatever the money spine says.
// A family whose trial did not start sees the paywall in guide voice, which is a recoverable state; a family
// refused its child is not.
import { log } from "@/modules/platform";
import type { Actor, FamilyId, Instant } from "@/modules/shared-types";
import type { StartTrialPort } from "./child-linking-deps";

export async function startTrialIfFirst(
  startTrial: StartTrialPort | undefined,
  input: {
    readonly familyId: FamilyId;
    readonly actor: Actor;
    readonly isFirstChild: boolean;
    readonly action: "createChild" | "claimInvite";
  },
): Promise<Instant | null> {
  if (!input.isFirstChild) return null;
  if (startTrial === undefined) {
    log.warn("trial not started: no port wired", {
      module: "app",
      action: `child-linking.${input.action}`,
      familyId: input.familyId,
    });
    return null;
  }
  const result = await startTrial(input.familyId, input.actor);
  if (!result.ok) {
    log.info("trial not started", {
      module: "app",
      action: `child-linking.${input.action}`,
      familyId: input.familyId,
      errorCode: result.error.code,
    });
    return null;
  }
  return (result.value.trialEndsAt as Instant | undefined) ?? null;
}
