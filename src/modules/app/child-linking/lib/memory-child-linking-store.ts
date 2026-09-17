// The in-memory `ChildLinkingStore` — the test double and the stub wiring. It mirrors the **rules** of `0012`
// rather than its SQL, because the point of a double is that a rule broken here is a rule broken there:
//
//   - `child_invites` has one pending row per (child, direction)  — `child_invites_one_pending_per_direction_idx`
//   - `child_client` has at most one **active** link per child    — `child_client_one_active_per_child_idx`
//   - `connect_child_invite` fills the missing party, refuses a wrong role, refuses someone else's stamped
//     invite, refuses a second claim of a claimed child, and clears the soft lock — 0012 §9, exception for
//     exception, by the same names (`INVITE_WRONG_ROLE`, `INVITE_NOT_YOURS`, `CHILD_ALREADY_CLAIMED` …), so a
//     rule that moves in SQL fails a test here rather than passing quietly.
//   - `get_invite_preview` answers for **pending** rows only and returns three columns, never an id.
//
// Roles are handed in rather than read, because there is no `user_roles` table in memory and inventing one
// would be a second source of truth for the thing the RPC actually checks.
import { BRAND } from "@/modules/config";
import { err, ok } from "@/modules/platform";
import type {
  ChildId,
  InviteId,
  Result,
  UserId,
  Uuid,
} from "@/modules/shared-types";
import type {
  ChildInsert,
  ChildLinkingStore,
  ChildRow,
  InviteInsert,
  InvitePatch,
  InviteRow,
  LinkRow,
} from "./child-linking-store";

type Seed = {
  readonly children?: ReadonlyArray<ChildRow>;
  readonly invites?: ReadonlyArray<InviteRow>;
  readonly links?: ReadonlyArray<LinkRow>;
  /** What `user_roles` would answer. A user missing from the map has no role at all. */
  readonly roles?: Readonly<Record<string, "parent" | "nanny" | "admin">>;
  readonly profileNames?: Readonly<Record<string, string>>;
  readonly newId?: () => Uuid;
  readonly now?: () => string;
};

type State = {
  children: ChildRow[];
  invites: InviteRow[];
  links: LinkRow[];
};

const fail = <T>(message: string): Result<T> =>
  err("INTERNAL", message, { reason: "memory-store" });

let counter = 0;
const defaultId = (): Uuid =>
  `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}` as Uuid;

export function memoryChildLinkingStore(seed: Seed = {}): ChildLinkingStore & {
  readonly state: State;
} {
  const state: State = {
    children: [...(seed.children ?? [])],
    invites: [...(seed.invites ?? [])],
    links: [...(seed.links ?? [])],
  };
  const roles = seed.roles ?? {};
  const names = seed.profileNames ?? {};
  const newId = seed.newId ?? defaultId;
  const now = seed.now ?? (() => new Date().toISOString());

  const childOf = (id: string): ChildRow | undefined =>
    state.children.find((row) => row.id === id);

  return Object.freeze({
    state,
    ownedChildren: async (parentUserId: UserId) =>
      ok(state.children.filter((row) => row.parent_user_id === parentUserId)),
    activeLinks: async (parentUserId: UserId) =>
      ok(
        state.links.filter(
          (row) =>
            row.parent_user_id === parentUserId && row.state === "active",
        ),
      ),
    activeLinksForChild: async (childId: ChildId) =>
      ok(
        state.links.filter(
          (row) =>
            row.child_id === (childId as string) && row.state === "active",
        ),
      ),
    childById: async (childId: ChildId) =>
      ok(childOf(childId as string) ?? null),
    linkById: async (linkId: Uuid) =>
      ok(state.links.find((row) => row.id === (linkId as string)) ?? null),
    insertChild: async (row: ChildInsert) => {
      const made = {
        ...row,
        id: row.id ?? newId(),
        created_at: row.created_at ?? now(),
        updated_at: row.updated_at ?? now(),
        status: row.status ?? "setup",
        onboarded: row.onboarded ?? false,
        gender: row.gender ?? null,
        profile_image_id: row.profile_image_id ?? null,
        orphaned_at: null,
        feed_locked_for_nanny: false,
        feed_locked_at: null,
        parent_user_id: row.parent_user_id ?? null,
      } as ChildRow;
      state.children = [...state.children, made];
      return ok(made);
    },
    invitesForChild: async (childId: ChildId) =>
      ok(state.invites.filter((row) => row.child_id === (childId as string))),
    inviteById: async (inviteId: InviteId) =>
      ok(state.invites.find((row) => row.id === (inviteId as string)) ?? null),
    insertInvite: async (row: InviteInsert) => {
      const clash = state.invites.some(
        (existing) =>
          existing.child_id === row.child_id &&
          existing.direction === row.direction &&
          existing.status === "pending",
      );
      if (clash)
        return fail<InviteRow>("child_invites_one_pending_per_direction_idx");
      const made = {
        ...row,
        id: row.id ?? newId(),
        status: row.status ?? "pending",
        created_at: row.created_at ?? now(),
        updated_at: now(),
        created_by_user_id: row.created_by_user_id ?? null,
        created_by_email_at_creation: row.created_by_email_at_creation ?? null,
        recipient_user_id: row.recipient_user_id ?? null,
        connected_at: null,
        connected_by_user_id: null,
        revoked_at: null,
        revoked_reason: null,
      } as InviteRow;
      state.invites = [...state.invites, made];
      return ok(made);
    },
    updateInvite: async (inviteId: InviteId, patch: InvitePatch) => {
      const index = state.invites.findIndex(
        (row) => row.id === (inviteId as string),
      );
      if (index < 0) return fail<InviteRow>("no invite row");
      const next = {
        ...state.invites[index],
        ...patch,
        updated_at: now(),
      } as InviteRow;
      state.invites = state.invites.map((row, at) =>
        at === index ? next : row,
      );
      return ok(next);
    },
    invitePreview: async (token: string) => {
      const invite = state.invites.find(
        (row) => row.token === token && row.status === "pending",
      );
      if (invite === undefined) return ok(null);
      const child = childOf(invite.child_id);
      if (child === undefined) return ok(null);
      return ok({
        child_first_name: child.first_name,
        direction: invite.direction,
        invited_by:
          // `get_invite_preview`'s own fallback for an inviter with no profile name (0012 §9), in config's
          // words rather than the migration's literal.
          names[invite.created_by_user_id ?? ""] ?? `A ${BRAND.name} member`,
      });
    },
    pendingInvites: async () => ok([]),
    connectInvite: async (token: string, userId: UserId) => {
      const invite = state.invites.find(
        (row) => row.token === token && row.status === "pending",
      );
      if (invite === undefined) return fail<Uuid>("INVITE_NOT_FOUND");
      if (
        invite.recipient_user_id !== null &&
        invite.recipient_user_id !== (userId as string)
      )
        return fail<Uuid>("INVITE_NOT_YOURS");
      const child = childOf(invite.child_id);
      if (child === undefined) return fail<Uuid>("INVITE_NOT_FOUND");

      const wanted =
        invite.direction === "nanny_to_parent" ? "parent" : "nanny";
      if (roles[userId as string] !== wanted)
        return fail<Uuid>("INVITE_WRONG_ROLE");

      const parentUserId =
        invite.direction === "nanny_to_parent"
          ? (userId as string)
          : (child.parent_user_id ?? invite.created_by_user_id);
      const nannyUserId =
        invite.direction === "nanny_to_parent"
          ? invite.created_by_user_id
          : (userId as string);
      if (parentUserId === null || nannyUserId === null)
        return fail<Uuid>("INVITE_INCOMPLETE");
      if (parentUserId === nannyUserId) return fail<Uuid>("INVITE_SELF_CLAIM");
      if (
        invite.direction === "nanny_to_parent" &&
        child.parent_user_id !== null &&
        child.parent_user_id !== (userId as string)
      )
        return fail<Uuid>("CHILD_ALREADY_CLAIMED");
      if (
        state.links.some(
          (row) => row.child_id === child.id && row.state === "active",
        )
      )
        return fail<Uuid>("CHILD_ALREADY_LINKED");

      const linkId = newId();
      state.links = [
        ...state.links,
        {
          id: linkId,
          child_id: child.id,
          nanny_user_id: nannyUserId,
          parent_user_id: parentUserId,
          placement_id: null,
          source: "invite",
          state: "active",
          ended_at: null,
          ended_by: null,
          end_reason: null,
          created_at: now(),
        } as LinkRow,
      ];
      state.children = state.children.map((row) =>
        row.id === child.id
          ? ({
              ...row,
              parent_user_id: parentUserId,
              feed_locked_for_nanny: false,
              feed_locked_at: null,
              orphaned_at: null,
            } as ChildRow)
          : row,
      );
      state.invites = state.invites.map((row) =>
        row.id === invite.id
          ? ({
              ...row,
              status: "connected",
              connected_at: now(),
              connected_by_user_id: userId as string,
              recipient_user_id: userId as string,
            } as InviteRow)
          : row,
      );
      return ok(linkId);
    },
  }) satisfies ChildLinkingStore & { readonly state: State };
}
