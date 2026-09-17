// `getAccess` (a pure, session-scoped read — RLS bounds it to the caller's own family) and `setAccess`, the admin
// toggle of 03 §5.4.6: admin only, one `access.toggled` event plus `access.opened` / `access.lapsed`, `app-ready`
// on an on-toggle. The toggle columns are written by this method and nothing else (02 I-M10).
import { PRICES } from "@/modules/config";
import { ok } from "@/modules/platform";
import type { Actor, FamilyId, Instant, Uuid } from "@/modules/shared-types";
import type { AccessChange, AccessState, PurchasePath } from "../types";
import { accessStateFromRow } from "./access-state-from-row";
import { blankSpineRow } from "./blank-spine-row";
import { carryStoreError } from "./carry-store-error";
import type { PaymentsDeps } from "./deps";
import { emitMoneyEvents } from "./emit-money-events";
import { fail } from "./fail";
import { sendAppReady } from "./send-app-ready";

const NONE: AccessState = Object.freeze({ state: "none" });

async function readOrHold(
  deps: PaymentsDeps,
  familyId: FamilyId,
): Promise<ReturnType<PaymentsDeps["store"]["readByFamily"]>> {
  const current = await deps.store.readByFamily(familyId, "service");
  if (!current.ok || current.value !== null) return current;
  const {
    id: _id,
    created_at: _c,
    updated_at: _u,
    ...row
  } = blankSpineRow(familyId, deps.now());
  return deps.store.insertSpine(row);
}

async function toggle(
  deps: PaymentsDeps,
  familyId: FamilyId,
  on: boolean,
  reason: string,
  actor: Extract<Actor, { kind: "admin" }>,
  until?: Instant,
): Promise<ReturnType<PurchasePath["setAccess"]>> {
  const before = await readOrHold(deps, familyId);
  if (!before.ok) return carryStoreError(before.error);
  if (before.value === null) return fail("E_FAMILY_NOT_FOUND", "No family");
  const at = deps.now();
  const after = await deps.store.updateSpine(before.value.id as Uuid, {
    access_toggled_on: on,
    access_toggled_at: at,
    access_toggled_by: actor.id,
    access_toggle_reason: reason,
    access_toggle_until: until ?? null,
  });
  if (!after.ok) return carryStoreError(after.error);
  const names = on
    ? (["access.toggled", "access.opened"] as const)
    : (["access.toggled", "access.lapsed"] as const);
  const events = await emitMoneyEvents(deps.events, {
    names,
    familyId,
    actor,
    props: {
      path: "payment-link",
      reason: "toggled",
      on,
      ...(until === undefined ? {} : { until }),
    },
  });
  if (on) {
    const contact = await deps.store.familyContact(familyId);
    await sendAppReady(deps.comms, familyId, contact.ok ? contact.value : null);
  }
  const change: AccessChange = {
    familyId,
    before: accessStateFromRow(before.value, at),
    after: accessStateFromRow(after.value, at),
    events,
    handled: "handled",
  };
  return ok(Object.freeze(change));
}

export function accessMethods(
  deps: PaymentsDeps,
): Pick<PurchasePath, "getAccess" | "setAccess"> {
  return {
    getAccess: async (familyId) => {
      const row = await deps.store.readByFamily(familyId, "session");
      if (!row.ok) return carryStoreError(row.error);
      return ok(
        row.value === null ? NONE : accessStateFromRow(row.value, deps.now()),
      );
    },
    setAccess: async (familyId, on, reason, actor, until) => {
      if (actor.kind !== "admin")
        return fail("E_ACTOR_FORBIDDEN", "Only an admin may switch access");
      if (reason.trim() === "")
        return fail("E_PLAN_INVALID", "A reason is required");
      return toggle(deps, familyId, on, reason.trim(), actor, until);
    },
  };
}
