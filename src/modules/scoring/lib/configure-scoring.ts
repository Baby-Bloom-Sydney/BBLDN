// Boot hook (03 §7.2 `createScoring(deps)` is the injection point): installs the engine the module-level
// `scoring` binding delegates to. Called from `src/instrumentation.ts` — absent in this repo (see the README) —
// and from test wiring.
import type { Scoring } from "../types";
import { SCORING_REGISTRY } from "./scoring-registry";

export function configureScoring(engine: Scoring): void {
  SCORING_REGISTRY.set(engine);
}
