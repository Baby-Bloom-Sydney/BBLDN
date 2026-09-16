// Boot hook: installs the reads the module-level `positions` binding delegates to. Called once from
// `src/instrumentation.ts` — absent in this repo (see the README) — and from test wiring. The slices register
// separately, through `registerSlice` (03 §2.5).
import type { PositionsReads } from "../types";
import { POSITIONS_REGISTRY } from "./positions-registry";

export function configurePositions(reads: PositionsReads): void {
  POSITIONS_REGISTRY.set(reads);
}
