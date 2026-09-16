// The boot slot behind the module-level `verification`. Replaced, never mutated.
import type { Verification, VerificationRegistry } from "../types";
import { unconfiguredVerification } from "./unconfigured-verification";

export const VERIFICATION_REGISTRY: VerificationRegistry = (() => {
  const slot = { current: unconfiguredVerification };
  return Object.freeze({
    get: () => slot.current,
    set: (next: Verification) => {
      slot.current = next;
    },
  });
})();
