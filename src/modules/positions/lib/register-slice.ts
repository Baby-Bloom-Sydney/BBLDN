// 03 §2.5 `registerSlice` — boot only (`src/instrumentation.ts`, §2.1). `connections`, `placements` and
// `call-layer` all register through this one mechanism (§12 item 35); nothing outside calls a slice directly.
// The signature is `shared-types`' `RegisterSlice` (ADR-119); this is its one implementation.
import type { RegisterSlice } from "@/modules/shared-types";
import { SLICE_REGISTRY } from "./slice-registry";

export const registerSlice: RegisterSlice = (slice) => {
  SLICE_REGISTRY.register(slice);
};
