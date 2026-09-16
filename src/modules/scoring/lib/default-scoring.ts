// 03 §7.2 — the connector object `matching` imports. Every method re-reads the registry so a later
// `configureScoring` reaches every importer that already holds the binding.
import type { Scoring } from "../types";
import { SCORING_REGISTRY } from "./scoring-registry";

export const scoring: Scoring = Object.freeze({
  scorePosition: (position, candidates) =>
    SCORING_REGISTRY.get().scorePosition(position, candidates),
  quickMatch: (availability, district, candidates) =>
    SCORING_REGISTRY.get().quickMatch(availability, district, candidates),
  preAuthMatch: (leadForm, candidates) =>
    SCORING_REGISTRY.get().preAuthMatch(leadForm, candidates),
  topN: (position, candidates, n) =>
    SCORING_REGISTRY.get().topN(position, candidates, n),
});
