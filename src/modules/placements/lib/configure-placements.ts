// Boot hook: installs the reads the module-level `placements` binding delegates to. The L-row slice is handed to
// `positions.registerSlice` by the boot file separately (03 §2.1).
import type { PlacementsReads } from "../types";
import { PLACEMENTS_REGISTRY } from "./placements-registry";

export function configurePlacements(reads: PlacementsReads): void {
  PLACEMENTS_REGISTRY.set(reads);
}
