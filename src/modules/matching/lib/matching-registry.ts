// The boot slot for the module-level `matching` binding. Fails closed until `configureMatching` installs the
// inside: every method loads the candidate set from the nanny tables (S5) and `autofire` additionally writes a lever and
// sends a batch of emails. A default that answered would show a parent an empty result set as though it were
// the true one.
import { err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { Matching } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Matching is not configured", {
  reason: "matching-not-configured" as const,
});

const unconfigured: Matching = Object.freeze({
  autofire: async () => NOT_CONFIGURED,
  quickMatch: async () => NOT_CONFIGURED,
  preAuthMatch: async () => NOT_CONFIGURED,
  resultsFor: async () => NOT_CONFIGURED,
  listPublicNannies: async () => NOT_CONFIGURED,
  getPublicNanny: async () => NOT_CONFIGURED,
  saveLead: async () => NOT_CONFIGURED,
  getLead: async () => NOT_CONFIGURED,
  connect: async () => NOT_CONFIGURED,
});

const slot = { current: unconfigured };

export const MATCHING_REGISTRY: Registry<Matching> = Object.freeze({
  get: () => slot.current,
  set: (next: Matching) => {
    slot.current = next;
  },
});
