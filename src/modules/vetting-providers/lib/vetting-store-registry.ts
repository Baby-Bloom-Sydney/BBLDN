// The boot slot for the submission store. Replaced, never mutated.
import type { VettingStoreRegistry, VettingSubmissionStore } from "../types";
import { unconfiguredVettingStore } from "./unconfigured-vetting-store";

export const VETTING_STORE_REGISTRY: VettingStoreRegistry = (() => {
  const slot = { current: unconfiguredVettingStore };
  return Object.freeze({
    get: () => slot.current,
    set: (next: VettingSubmissionStore) => {
      slot.current = next;
    },
  });
})();
