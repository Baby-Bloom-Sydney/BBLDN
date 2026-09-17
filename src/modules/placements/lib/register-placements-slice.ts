// The boot seam: `placements` cannot call `positions.registerSlice` itself (01 §2.3 gives it no arrow), so it
// exports the registration *argument* and the boot file, which may import both, does the registering.
import type { PlacementsSlice } from "../types";

export const placementsSliceRegistration = (slice: PlacementsSlice) =>
  Object.freeze({ entity: "placement" as const, handlers: slice });
