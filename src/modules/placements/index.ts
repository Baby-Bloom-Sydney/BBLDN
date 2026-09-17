// placements connector (01 §2.5; 03 §2.2) — confirm (hours, rate, start), end, close, as a **slice** of
// `positions`. Its L-row handlers are registered with the stage model at boot; nothing outside calls a slice
// directly (03 §2.1). May import `hire-docs` · `payments` · `comms` (S) · `auth` (S) · `platform` (S) — **not**
// `positions` (01 §2.3), so the boot file does the registering.
export type * from "./types";

// The state vocabulary a caller reads a placement through (03 §2.2).
export type { PlacementState } from "@/modules/shared-types";

// The L-row slice the boot file hands to `positions.registerSlice` (03 §2.1).
export { stubPlacementsSlice } from "./lib/stub-placements-slice";

// The inside (`1g`): the three L rows over the store port, the I-3 read, and the §2.4 placement table.
export { createPlacementsSlice } from "./lib/create-placements-slice";
export { createPlacements } from "./lib/create-placements";
export { memoryPlacementStore } from "./lib/memory-placement-store";
export { placementsSliceRegistration } from "./lib/register-placements-slice";
export { PLACEMENT_TRANSITIONS } from "./lib/placement-transitions";

// The read `positions` calls for invariant I-3 (03 §2.6).
export { placements } from "./lib/default-placements";
export { configurePlacements } from "./lib/configure-placements";
export { stubPlacements } from "./placements.stub";
