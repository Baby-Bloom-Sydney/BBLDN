// placements connector (01 §2.5; 03 §2.2) — confirm (hours, rate, start), end, close, as a **slice** of
// `positions`. Its L-row handlers are registered with the stage model at boot; nothing outside calls a slice
// directly (03 §2.1). May import `hire-docs` · `payments` · `comms` (S) · `auth` (S) · `platform` (S) — **not**
// `positions` (01 §2.3), so the boot file does the registering.
export type * from "./types";

// The state vocabulary a caller reads a placement through (03 §2.2).
export type { PlacementState } from "@/modules/shared-types";

// The L-row slice the boot file hands to `positions.registerSlice` (03 §2.1). Phase 1f writes the real handlers.
export { stubPlacementsSlice } from "./lib/stub-placements-slice";

// The read `positions` calls for invariant I-3 (03 §2.6).
export { placements } from "./lib/default-placements";
export { configurePlacements } from "./lib/configure-placements";
export { stubPlacements } from "./placements.stub";
