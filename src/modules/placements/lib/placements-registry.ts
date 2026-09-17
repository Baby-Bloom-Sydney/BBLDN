// The boot slot for the module-level `placements` reads. Fails closed until `configurePlacements` installs the
// inside: the read is the evidence for invariant I-3, and answering "no placement" from nowhere would let a
// second placement onto a position that already has one.
import { err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { PlacementsReads } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Placements is not configured", {
  reason: "placements-not-configured" as const,
});

const unconfigured: PlacementsReads = Object.freeze({
  activeForPosition: async () => NOT_CONFIGURED,
  liveForParent: async () => NOT_CONFIGURED,
});

const slot = { current: unconfigured };

export const PLACEMENTS_REGISTRY: Registry<PlacementsReads> = Object.freeze({
  get: () => slot.current,
  set: (next: PlacementsReads) => {
    slot.current = next;
  },
});
