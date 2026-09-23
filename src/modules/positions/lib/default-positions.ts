// 03 §2.5 — the read half of the stage-model connector, as the object callers import. `advance` and
// `registerSlice` are module-level functions beside it: they dispatch into the slice registry, not into whatever
// the boot code configured, and keeping them off this object is what stops a caller reaching a slice directly.
import type { PositionsReads } from "../types";
import { POSITIONS_REGISTRY } from "./positions-registry";

export const positions: PositionsReads = Object.freeze({
  amend: (input) => POSITIONS_REGISTRY.get().amend(input),
  getStage: (entity) => POSITIONS_REGISTRY.get().getStage(entity),
  getJourneySteps: (parentId) =>
    POSITIONS_REGISTRY.get().getJourneySteps(parentId),
  listAllowed: (entity, actor) =>
    POSITIONS_REGISTRY.get().listAllowed(entity, actor),
  getForMatching: (positionId) =>
    POSITIONS_REGISTRY.get().getForMatching(positionId),
  recordPrecheck: (positionId, record) =>
    POSITIONS_REGISTRY.get().recordPrecheck(positionId, record),
  findLive: (parentId) => POSITIONS_REGISTRY.get().findLive(parentId),
  awaitingPrecheck: () => POSITIONS_REGISTRY.get().awaitingPrecheck(),
});
