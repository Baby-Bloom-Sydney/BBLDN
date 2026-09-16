// The boot slot for `app/child-linking`'s reads. **Fails closed**: the youngest child's date of birth is what
// bounds a family's access (ADR-083 / 084), so answering "no children" from nowhere would silently shorten — or,
// read the other way, unbound — every family's grant.
import { err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { ChildLinkingReads } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Child linking is not configured", {
  reason: "child-linking-not-configured" as const,
});

const unconfigured: ChildLinkingReads = Object.freeze({
  linkedChildren: async () => NOT_CONFIGURED,
  youngestChildDateOfBirth: async () => NOT_CONFIGURED,
});

const slot = { current: unconfigured };

export const CHILD_LINKING_REGISTRY: Registry<ChildLinkingReads> =
  Object.freeze({
    get: () => slot.current,
    set: (next: ChildLinkingReads) => {
      slot.current = next;
    },
  });
