// The boot slot for the module-level `scoring` binding. Fails closed until `configureScoring` installs an engine:
// the three-layer engine of 03 §7.1 is Phase 1, and a default that answered would be a made-up score reaching a
// parent's results page.
import { err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { Scoring } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Scoring is not configured", {
  reason: "scoring-not-configured" as const,
});

const unconfigured: Scoring = Object.freeze({
  scorePosition: async () => NOT_CONFIGURED,
  quickMatch: async () => NOT_CONFIGURED,
  preAuthMatch: async () => NOT_CONFIGURED,
  topN: async () => NOT_CONFIGURED,
});

const slot = { current: unconfigured };

export const SCORING_REGISTRY: Registry<Scoring> = Object.freeze({
  get: () => slot.current,
  set: (next: Scoring) => {
    slot.current = next;
  },
});
