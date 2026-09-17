// The boot seam: `connections` cannot call `positions.registerSlice` itself (01 §2.3 gives it no arrow —
// the cycle R2 closed), so it exports the registration *argument* and the boot file, which may import both,
// does the registering. The same inversion `call-layer` and `placements` use.
import type { ConnectionsSlice } from "../types";

export const connectionsSliceRegistration = (slice: ConnectionsSlice) =>
  Object.freeze({ entity: "connection" as const, handlers: slice });
