// The reads: the two `ChildLinkingReads` the rest of the tree already depended on, the lookups `1i`'s screens
// need, and rail row 8's three facts.
//
// **`linkedChildren` means every child this family's access is computed over**, which is the union of the
// children it owns and the children it is linked to — the same union `set_access_window` takes in SQL (0010 §8,
// after `database-reviewer` H-6: the first draft made the link query a fallback, so a family with one owned
// child never counted a younger linked one). Two places computing "the family's children" two ways is exactly
// how ADR-083's window drifts from the product, so the union is written here the same way it is written there.
//
// `youngestChildDateOfBirth` is the **max** date of birth, not the min: the youngest child is the most recently
// born one, and the window runs to their third birthday.
import { ok } from "@/modules/platform";
import type {
  ChildId,
  FamilyId,
  ISODate,
  Instant,
  InviteId,
  NannyId,
  UserId,
} from "@/modules/shared-types";
import type {
  ChildLink,
  ChildLinkingLookups,
  ChildLinkingReads,
  InviteDirection,
} from "../types";
import { carryLinkStoreError } from "./carry-link-store-error";
import type { ChildLinkingDeps } from "./child-linking-deps";
import { childRecordOf } from "./child-record-of";

export function readMethods(
  deps: ChildLinkingDeps,
): ChildLinkingReads &
  Pick<
    ChildLinkingLookups,
    "invitePreview" | "pendingInvites" | "childrenOfFamily" | "appLinkFacts"
  > {
  /** The union — owned children plus linked ones, de-duplicated by child id, with the nannies on each. */
  const familyChildren = async (familyId: FamilyId) => {
    const userId = familyId as string as UserId;
    const [owned, links] = await Promise.all([
      deps.store.ownedChildren(userId),
      deps.store.activeLinks(userId),
    ]);
    if (!owned.ok) return carryLinkStoreError(owned.error);
    if (!links.ok) return carryLinkStoreError(links.error);

    const nanniesOf = new Map<string, NannyId[]>();
    for (const link of links.value) {
      const list = nanniesOf.get(link.child_id) ?? [];
      list.push(link.nanny_user_id as NannyId);
      nanniesOf.set(link.child_id, list);
    }

    const byId = new Map(owned.value.map((row) => [row.id, row]));
    const missing = [...nanniesOf.keys()].filter((id) => !byId.has(id));
    for (const id of missing) {
      const row = await deps.store.childById(id as ChildId);
      if (!row.ok) return carryLinkStoreError(row.error);
      if (row.value !== null) byId.set(row.value.id, row.value);
    }
    return ok({ rows: [...byId.values()], nanniesOf, links: links.value });
  };

  return {
    linkedChildren: async (familyId: FamilyId) => {
      const all = await familyChildren(familyId);
      if (!all.ok) return all;
      const children: ChildLink[] = all.value.rows.map((row) =>
        Object.freeze({
          childId: row.id as ChildId,
          familyId,
          dateOfBirth: row.date_of_birth as ISODate,
          linkedNannyIds: Object.freeze(all.value.nanniesOf.get(row.id) ?? []),
        }),
      );
      return ok(Object.freeze(children));
    },

    youngestChildDateOfBirth: async (familyId: FamilyId) => {
      const all = await familyChildren(familyId);
      if (!all.ok) return all;
      const dates = all.value.rows.map((row) => row.date_of_birth).sort();
      const youngest = dates.at(-1);
      return ok((youngest as ISODate | undefined) ?? null);
    },

    childrenOfFamily: async (familyId: FamilyId) => {
      const all = await familyChildren(familyId);
      if (!all.ok) return all;
      return ok(Object.freeze(all.value.rows.map(childRecordOf)));
    },

    appLinkFacts: async (familyId: FamilyId) => {
      const all = await familyChildren(familyId);
      if (!all.ok) return all;
      const hasChild = all.value.rows.length > 0;
      const nannyLinked = all.value.links.length > 0;
      let invitePending = false;
      for (const row of all.value.rows) {
        const invites = await deps.store.invitesForChild(row.id as ChildId);
        if (!invites.ok) return carryLinkStoreError(invites.error);
        if (invites.value.some((invite) => invite.status === "pending")) {
          invitePending = true;
          break;
        }
      }
      return ok(Object.freeze({ hasChild, invitePending, nannyLinked }));
    },

    invitePreview: async (rawToken: string) => {
      const row = await deps.store.invitePreview(rawToken);
      if (!row.ok) return carryLinkStoreError(row.error);
      if (row.value === null) return ok(null);
      return ok(
        Object.freeze({
          childFirstName: row.value.child_first_name,
          direction: row.value.direction as InviteDirection,
          invitedBy: row.value.invited_by,
        }),
      );
    },

    pendingInvites: async () => {
      const rows = await deps.store.pendingInvites();
      if (!rows.ok) return carryLinkStoreError(rows.error);
      return ok(
        Object.freeze(
          rows.value.map((row) =>
            Object.freeze({
              inviteId: row.invite_id as string as InviteId,
              childId: row.child_id as string as ChildId,
              childFirstName: row.child_first_name,
              direction: row.direction as InviteDirection,
              createdAt: row.created_at as Instant,
            }),
          ),
        ),
      );
    },
  } as ChildLinkingReads &
    Pick<
      ChildLinkingLookups,
      "invitePreview" | "pendingInvites" | "childrenOfFamily" | "appLinkFacts"
    >;
}
