// The boot slot for `app/child-linking`. **Fails closed on every method**: the youngest child's date of birth
// is what bounds a family's access (ADR-083 / 084), so answering "no children" from nowhere would silently
// unbound every family's grant — and a write that quietly did nothing would leave a family looking at a share
// link that exists on no row.
import { err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { ChildLinking } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Child linking is not configured", {
  reason: "child-linking-not-configured" as const,
});

const refuse = async () => NOT_CONFIGURED;

/** ★ REVIEW-2 (typescript-review HIGH): **annotated, never cast.** This used to end `}) as unknown as
 *  ChildLinking`, which removes the missing-property check — so a twelfth method added to the connector would
 *  compile here and answer `TypeError: x is not a function` at the unconfigured slot instead of refusing, which
 *  is the exact opposite of this file's first paragraph. `admin-on-behalf-registry.ts` annotates and gets the
 *  guarantee free; so does this now. `ports.fail-closed.test.ts` and `app.fail-closed.test.ts` are the run-time
 *  half — the compiler is the half that catches the method nobody remembered. */
const unconfigured: ChildLinking = Object.freeze({
  linkedChildren: refuse,
  youngestChildDateOfBirth: refuse,
  childrenOfFamily: refuse,
  appLinkFacts: refuse,
  invitePreview: refuse,
  pendingInvites: refuse,
  invitesForChild: refuse,
  createChild: refuse,
  createInvite: refuse,
  revokeInvite: refuse,
  claimInvite: refuse,
});

const slot = { current: unconfigured };

export const CHILD_LINKING_REGISTRY: Registry<ChildLinking> = Object.freeze({
  get: () => slot.current,
  set: (next: ChildLinking) => {
    slot.current = next;
  },
});
