// 03 §10.1 — the connector object `admin` imports for rows 3–8. Re-reads the registry on every call.
import type { AdminOnBehalf } from "../types";
import { ADMIN_ON_BEHALF_REGISTRY } from "./admin-on-behalf-registry";

export const adminOnBehalf: AdminOnBehalf = Object.freeze({
  advance: (input) => ADMIN_ON_BEHALF_REGISTRY.get().advance(input),
  listAllowed: (entity, actor) =>
    ADMIN_ON_BEHALF_REGISTRY.get().listAllowed(entity, actor),
  chooseSlot: (positionId, slotId, holdId, actor, idempotencyKey) =>
    ADMIN_ON_BEHALF_REGISTRY.get().chooseSlot(
      positionId,
      slotId,
      holdId,
      actor,
      idempotencyKey,
    ),
  moveSlot: (ref, slotId, actor) =>
    ADMIN_ON_BEHALF_REGISTRY.get().moveSlot(ref, slotId, actor),
  clearSlot: (positionId, actor, reason) =>
    ADMIN_ON_BEHALF_REGISTRY.get().clearSlot(positionId, actor, reason),
  recordOutcome: (ref, outcome, notes, actor) =>
    ADMIN_ON_BEHALF_REGISTRY.get().recordOutcome(ref, outcome, notes, actor),
  bookNannyCall: (input) => ADMIN_ON_BEHALF_REGISTRY.get().bookNannyCall(input),
  autofire: (positionId, actor) =>
    ADMIN_ON_BEHALF_REGISTRY.get().autofire(positionId, actor),
});
