// 03 §2.5 `registerSlice` — boot only (`src/instrumentation.ts`, §2.1). `connections`, `placements` and
// `call-layer` all register through this one mechanism (§12 item 35); nothing outside calls a slice directly.
import type { SliceRegistration } from "../types";
import { SLICE_REGISTRY } from "./slice-registry";

export function registerSlice(slice: SliceRegistration): void {
  SLICE_REGISTRY.register(slice);
}
