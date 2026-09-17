// `startTrial` (03 §5.4.4): self-serve families only, on the first child, once per family for life. The RPC
// `start_family_trial_if_first` holds the rule (0010 §8) — this method passes it `PRICES.trialDays` and
// `FLAGS.NEW_TRIALS`, reads what it did, and emits `trial.started` + `access.opened` only when a trial began.
import { PRICES } from "@/modules/config";
import { ok } from "@/modules/platform";
import type { Actor, FamilyId, Instant } from "@/modules/shared-types";
import type { PurchasePath } from "../types";
import type { PaymentsDeps } from "./deps";
import { emitMoneyEvents } from "./emit-money-events";
import { fail } from "./fail";
import type { SpineRow } from "./spine-store";

const mayStart = (actor: Actor, familyId: FamilyId): boolean =>
  actor.kind === "admin" ||
  actor.kind === "system" ||
  (actor.kind === "user" && actor.id === familyId);

const isDfy = (row: SpineRow | null): boolean =>
  row !== null && (row.placement_id !== null || row.status === "placed");

export function trialMethods(deps: PaymentsDeps): Pick<PurchasePath, "startTrial"> {
  return {
    startTrial: async (familyId, actor) => {
      if (!mayStart(actor, familyId))
        return fail("E_ACTOR_FORBIDDEN", "Not this family");
      const current = await deps.store.readByFamily(familyId, "service");
      if (!current.ok) return current;
      if (isDfy(current.value))
        return fail("E_DFY_FAMILY", "A done-for-you family has no trial");
      if (current.value?.has_used_trial) return ok({ alreadyUsed: true as const });
      const row = await deps.store.startTrial(
        familyId,
        PRICES.trialDays,
        deps.newTrialsEnabled(),
      );
      if (!row.ok) return row;
      const started = row.value;
      if (started === null || started.trial_ends_at === null)
        return ok({ alreadyUsed: true as const });
      const fresh = current.value?.trial_started_at === null || current.value === null;
      if (!fresh) return ok({ alreadyUsed: true as const });
      await emitMoneyEvents(deps.events, {
        names: ["trial.started", "access.opened"],
        familyId,
        actor,
        props: { path: "self-serve", reason: "trial", trialEndsAt: started.trial_ends_at },
      });
      return ok({ trialEndsAt: started.trial_ends_at as Instant });
    },
  };
}
