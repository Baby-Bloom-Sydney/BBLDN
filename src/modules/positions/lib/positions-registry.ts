// The boot slot for the module-level `positions` reads (`amend` · `getStage` · `getJourneySteps` ·
// `listAllowed` · `getForMatching` · `recordPrecheck`). Fails closed until `configurePositions` installs an
// implementation: these read the marketplace tables, which arrive with S5's migration set, and a default that
// answered would put an invented journey on a parent's dashboard.
//
// `listAllowed` has no `Result` in the contract (03 §2.5 returns the ids directly), so unconfigured it returns
// no levers — a button that is absent, never a button that moves a stage nothing is behind.
import { err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { PositionsReads } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Positions is not configured", {
  reason: "positions-not-configured" as const,
});

const unconfigured: PositionsReads = Object.freeze({
  amend: async () => NOT_CONFIGURED,
  getStage: async () => NOT_CONFIGURED,
  getJourneySteps: async () => NOT_CONFIGURED,
  listAllowed: async () => Object.freeze([]),
  getForMatching: async () => NOT_CONFIGURED,
  recordPrecheck: async () => NOT_CONFIGURED,
});

const slot = { current: unconfigured };

export const POSITIONS_REGISTRY: Registry<PositionsReads> = Object.freeze({
  get: () => slot.current,
  set: (next: PositionsReads) => {
    slot.current = next;
  },
});
