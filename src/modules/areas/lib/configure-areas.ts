// Boot hook (03 §6.3 "selection `AREAS_SOURCE.provider: 'db' | 'stub'`"): installs the provider the module-level
// `areas` binding delegates to. Called once from `src/instrumentation.ts` — which this repo does not have yet
// (see the module README) — and from test wiring.
import type { AreasProvider } from "../types";
import { AREAS_REGISTRY } from "./areas-registry";

export function configureAreas(provider: AreasProvider): void {
  AREAS_REGISTRY.set(provider);
}
