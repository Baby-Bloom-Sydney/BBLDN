// `scoring` (03 §7.2) — the three-layer engine is pure (03 §7.1): no store, no clock, no network of its own, so
// there is no environment in which the real inside would be unsafe and it is installed everywhere. Both of its
// dependencies are still chosen here rather than inside the module (05 §3 rule 1): the distance provider — the
// swappable of 03 §7.2, `haversine` day one, transport-reach later — and `MATCHING`, the one frozen table
// `matching` reads, never a second copy.
import { MATCHING } from "@/modules/config";
import {
  configureScoring,
  createScoring,
  haversineProvider,
} from "@/modules/scoring";
import type { PortWiring } from "./types";

export function wireScoring(): PortWiring {
  configureScoring(
    createScoring({ distance: haversineProvider(), config: MATCHING }),
  );
  return {
    port: "scoring",
    binding: "create-scoring (haversine distance over areas, MATCHING config)",
  };
}
