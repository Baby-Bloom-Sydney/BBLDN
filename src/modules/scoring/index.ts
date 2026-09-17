// scoring connector (01 §2.5; 03 §7.2) — the three-layer match engine's public surface. Pure: no stage move, no
// message, no row (03 §7.1). Its only caller is `matching`; `positions` never imports it (fix: A-1 / R2), and
// `admin` reads through `positions`. May import `config` · `shared-types` · `areas` (S) · `platform` (S) only.
export type * from "./types";

// The engine (03 §7.2) — the module binding over the boot registry.
export { scoring } from "./lib/default-scoring";
export { configureScoring } from "./lib/configure-scoring";

// The engine (03 §7.2 `createScoring(deps)` — Phase 1 `1b`, row `04.01`) and the stub the contract names (03 §7.5).
export { createScoring } from "./lib/create-scoring";

// The lead-form → in-memory-position mapping of 03 §7.3, re-exported so `matching` builds a position the same
// way `preAuthMatch` does instead of keeping a second copy of `ageRangeToMonths` (`1e`).
export { leadFormToPosition } from "./lib/engine/lead-form-to-position";
export { stubScoring } from "./scoring.stub";

// `scoring/distance` — the swappable, re-exported so the outside never deep-imports the sub-module (05 §7 rule 2).
export { haversineProvider, stubDistanceProvider } from "./distance";
export type { DistanceFixtures } from "./distance";
