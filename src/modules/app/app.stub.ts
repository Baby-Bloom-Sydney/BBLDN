// The `app` stub — the child-linking reads answered from a seed, so `payments` and `access-gate` can be built
// against the `accessUntil` rule (ADR-083 / 084) before the child tables exist. Katie and child-development have
// no runtime surface yet, so there is nothing to stub for them.
import { ok } from "@/modules/platform";
import type { FamilyId, ISODate } from "@/modules/shared-types";
import type { ChildLink, ChildLinkingReads } from "./child-linking";

export type StubAppSeed = Readonly<Record<string, ReadonlyArray<ChildLink>>>;

const earliest = (children: ReadonlyArray<ChildLink>): ISODate | null =>
  children.length === 0
    ? null
    : children.reduce((youngest, child) =>
        child.dateOfBirth > youngest.dateOfBirth ? child : youngest,
      ).dateOfBirth;

export function stubApp(seed: StubAppSeed = {}): ChildLinkingReads {
  const childrenOf = (familyId: FamilyId): ReadonlyArray<ChildLink> =>
    seed[familyId] ?? [];
  return Object.freeze({
    linkedChildren: async (familyId: FamilyId) => ok(childrenOf(familyId)),
    youngestChildDateOfBirth: async (familyId: FamilyId) =>
      ok(earliest(childrenOf(familyId))),
  });
}
