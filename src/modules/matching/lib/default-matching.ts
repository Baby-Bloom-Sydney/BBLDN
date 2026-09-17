// 03 §10.1 — the connector object `public-site`, `onboarding-parent` and `admin-on-behalf` import. Re-reads the
// registry on every call so boot wiring reaches every importer.
import type { Matching } from "../types";
import { MATCHING_REGISTRY } from "./matching-registry";

export const matching: Matching = Object.freeze({
  autofire: (positionId, actor) =>
    MATCHING_REGISTRY.get().autofire(positionId, actor),
  quickMatch: (availability, district) =>
    MATCHING_REGISTRY.get().quickMatch(availability, district),
  preAuthMatch: (leadForm) => MATCHING_REGISTRY.get().preAuthMatch(leadForm),
  resultsFor: (positionId, actor) =>
    MATCHING_REGISTRY.get().resultsFor(positionId, actor),
  listPublicNannies: () => MATCHING_REGISTRY.get().listPublicNannies(),
  getPublicNanny: (nannyId) => MATCHING_REGISTRY.get().getPublicNanny(nannyId),
  saveLead: (input) => MATCHING_REGISTRY.get().saveLead(input),
  getLead: (leadId) => MATCHING_REGISTRY.get().getLead(leadId),
  connect: (input) => MATCHING_REGISTRY.get().connect(input),
});
