// 03 §2.7 — the connector object callers import (S-P-01/02, S-N-02 through `listSlots` / `openNannyCall`, the
// admin call queue). Every method re-reads the registry so boot wiring reaches every importer.
import type { CallLayer } from "../types";
import { CALL_LAYER_REGISTRY } from "./call-layer-registry";

export const callLayer: CallLayer = Object.freeze({
  listSlots: (kind, range) => CALL_LAYER_REGISTRY.get().listSlots(kind, range),
  chooseSlot: (positionId, slotId, holdId, actor, idempotencyKey) =>
    CALL_LAYER_REGISTRY.get().chooseSlot(
      positionId,
      slotId,
      holdId,
      actor,
      idempotencyKey,
    ),
  moveSlot: (ref, slotId, actor) =>
    CALL_LAYER_REGISTRY.get().moveSlot(ref, slotId, actor),
  clearSlot: (positionId, actor, reason) =>
    CALL_LAYER_REGISTRY.get().clearSlot(positionId, actor, reason),
  openNannyCall: (input) => CALL_LAYER_REGISTRY.get().openNannyCall(input),
  recordOutcome: (ref, outcome, notes, actor) =>
    CALL_LAYER_REGISTRY.get().recordOutcome(ref, outcome, notes, actor),
  getCallState: (ref) => CALL_LAYER_REGISTRY.get().getCallState(ref),
  findOpenCall: (parentId) => CALL_LAYER_REGISTRY.get().findOpenCall(parentId),
  findNannyBooking: (nannyId) =>
    CALL_LAYER_REGISTRY.get().findNannyBooking(nannyId),
  listOpenCalls: () => CALL_LAYER_REGISTRY.get().listOpenCalls(),
});
