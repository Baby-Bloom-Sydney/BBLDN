// Boot hook: installs the inside the module-level `callLayer` binding delegates to. Called from
// `src/instrumentation.ts` — absent in this repo — and from test wiring. Registering the C-row slice with the
// stage model is the separate `registerCallLayerSlice` call (03 §2.1).
import type { CallLayer } from "../types";
import { CALL_LAYER_REGISTRY } from "./call-layer-registry";

export function configureCallLayer(inside: CallLayer): void {
  CALL_LAYER_REGISTRY.set(inside);
}
