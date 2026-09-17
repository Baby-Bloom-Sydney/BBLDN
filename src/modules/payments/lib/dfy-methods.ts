// `openDfyAccess` (03 §5.4.1 / §5.4.4; ADR-093 / 094): called by `placements` on L-1b `placement.started`. The
// RPC `open_dfy_access` holds the rule (0010 §8: upsert to `placed`, the two windows from `PRICES`, idempotent,
// never re-arming an unpaid first placement); this method calls it, snapshots nothing (the first-week wages are
// snapshotted at link mint — 02 §4.5), emits `access.opened { reason: 'placed' }` once and sends `app-ready`.
import { PRICES } from "@/modules/config";
import { ok } from "@/modules/platform";
import type { Actor } from "@/modules/shared-types";
import type { AccessChange, PurchasePath } from "../types";
import { accessStateFromRow } from "./access-state-from-row";
import { carryStoreError } from "./carry-store-error";
import type { PaymentsDeps } from "./deps";
import { emitMoneyEvents } from "./emit-money-events";
import { fail } from "./fail";
import { sendAppReady } from "./send-app-ready";

const mayOpen = (actor: Actor): boolean =>
  actor.kind === "admin" || actor.kind === "system";

export function dfyMethods(
  deps: PaymentsDeps,
): Pick<PurchasePath, "openDfyAccess"> {
  return {
    openDfyAccess: async (familyId, placementId, actor) => {
      if (!mayOpen(actor))
        return fail(
          "E_ACTOR_FORBIDDEN",
          "Only the placement flow opens access",
        );
      const at = deps.now();
      const before = await deps.store.readByFamily(familyId, "service");
      if (!before.ok) return carryStoreError(before.error);
      const wasPlaced = before.value?.status === "placed";
      const after = await deps.store.openDfyAccess(
        familyId,
        placementId,
        PRICES.paymentAfterStartDays,
        PRICES.satisfactionWindowDays,
      );
      if (!after.ok) return carryStoreError(after.error);
      await deps.store.setAccessWindow(familyId, PRICES.accessAgeYears);
      const events = wasPlaced
        ? []
        : await emitMoneyEvents(deps.events, {
            names: ["access.opened"],
            familyId,
            actor,
            props: {
              path: "payment-link",
              reason: "placed",
              placementId,
              paymentDueAt: after.value.payment_due_at ?? undefined,
              satisfactionWindowEndsAt:
                after.value.satisfaction_window_ends_at ?? undefined,
            },
          });
      if (!wasPlaced) {
        const contact = await deps.store.familyContact(familyId);
        await sendAppReady(
          deps.comms,
          familyId,
          contact.ok ? contact.value : null,
        );
      }
      const change: AccessChange = {
        familyId,
        before: accessStateFromRow(before.value, at),
        after: accessStateFromRow(after.value, at),
        events,
        handled: wasPlaced ? "skipped-duplicate" : "handled",
      };
      return ok(Object.freeze(change));
    },
  };
}
