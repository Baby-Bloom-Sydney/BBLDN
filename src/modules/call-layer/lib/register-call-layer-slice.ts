// 03 §2.1 / §2.5 — `call-layer` hands its C-row `TransitionHandler`s to the stage model at boot. This is the
// whole reason `positions` never imports `call-layer` (fix: A-2 / R2): the slice is passed in, not imported.
//
// The handlers themselves are the caller's — Phase 1g writes the C-row insides; this unit owns the seam only.
import { registerSlice } from "@/modules/positions";
import type { CallLayerSlice } from "../types";

export function registerCallLayerSlice(handlers: CallLayerSlice): void {
  registerSlice({ entity: "call", handlers });
}
