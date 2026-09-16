// The connector object `positions` imports (01 §2.3 row `positions`). Re-reads the registry on every call so boot
// wiring reaches every importer.
import type { PlacementsReads } from "../types";
import { PLACEMENTS_REGISTRY } from "./placements-registry";

export const placements: PlacementsReads = Object.freeze({
  activeForPosition: (positionId) =>
    PLACEMENTS_REGISTRY.get().activeForPosition(positionId),
});
