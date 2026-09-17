// The `app` stub — the child-linking **reads** answered from a seed, so `payments` and `access-gate` can be
// built against the `accessUntil` rule (ADR-083 / 084) without the child tables. Katie and child-development
// have no runtime surface yet, so there is nothing to stub for them.
//
// `1i` gave the connector a write half, and the stub does **not** fake it: every write refuses with the same
// `child-linking-not-configured` the unwired binding gives. A seed-backed mint would hand out a token that
// exists on no row — the one failure mode a share link cannot recover from — and the real memory inside
// (`memoryChildLinkingStore` + `createChildLinking`) is what a test that wants writes should use.
import { err, ok } from "@/modules/platform";
import type { FamilyId, ISODate } from "@/modules/shared-types";
import type { ChildLink, ChildLinking } from "./child-linking";

export type StubAppSeed = Readonly<Record<string, ReadonlyArray<ChildLink>>>;

/** The **youngest** child — the latest date of birth, which is what bounds access (ADR-083 / 084). */
const youngestDateOfBirth = (
  children: ReadonlyArray<ChildLink>,
): ISODate | null =>
  children.length === 0
    ? null
    : children.reduce((youngest, child) =>
        child.dateOfBirth > youngest.dateOfBirth ? child : youngest,
      ).dateOfBirth;

const NO_WRITES = err("INTERNAL", "Child linking is not configured", {
  reason: "child-linking-not-configured" as const,
});

const refuse = async () => NO_WRITES;

export function stubApp(seed: StubAppSeed = {}): ChildLinking {
  const childrenOf = (familyId: FamilyId): ReadonlyArray<ChildLink> =>
    seed[familyId] ?? [];
  return Object.freeze({
    linkedChildren: async (familyId: FamilyId) => ok(childrenOf(familyId)),
    youngestChildDateOfBirth: async (familyId: FamilyId) =>
      ok(youngestDateOfBirth(childrenOf(familyId))),
    childrenOfFamily: refuse,
    appLinkFacts: refuse,
    invitePreview: refuse,
    pendingInvites: refuse,
    invitesForChild: refuse,
    createChild: refuse,
    createInvite: refuse,
    revokeInvite: refuse,
    claimInvite: refuse,
  }) as unknown as ChildLinking;
}
