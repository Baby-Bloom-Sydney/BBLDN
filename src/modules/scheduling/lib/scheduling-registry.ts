// The boot slot behind the module-level `scheduling`. Replaced, never mutated; every method re-reads it.
import type { Scheduling, SchedulingRegistry } from "../types";
import { unconfiguredScheduling } from "./unconfigured-scheduling";

export const SCHEDULING_REGISTRY: SchedulingRegistry = (() => {
  const slot = { current: unconfiguredScheduling };
  return Object.freeze({
    get: () => slot.current,
    set: (next: Scheduling) => {
      slot.current = next;
    },
  });
})();
