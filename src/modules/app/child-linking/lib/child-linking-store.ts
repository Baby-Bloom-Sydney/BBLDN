// The one seam between the child-linking rules and the database: `children`, `child_client`, `child_invites`
// (02 §4.6) and the four RPCs of 02 §7 this module is the caller of. The rules in `create-child-linking.ts`
// never see a driver, a table name or a scope — they see this. `db-child-linking-store.ts` is the real inside
// over `auth`'s data port; `memory-child-linking-store.ts` is the test double and the stub wiring.
//
// **Scope, stated once (01 §6.3; 07 §5.2 row `children · child_client · child_invites`).**
//   - `children` reads and the insert run **session**-scoped: RLS is `user_has_child_access` for SELECT and
//     "any parent, as themselves / any nanny, unowned" for INSERT, which is exactly the rule wanted.
//   - `child_client` reads run **session**-scoped for the same reason (`child_client_party_select`).
//   - `child_invites` has a SELECT policy but **no client INSERT and no client UPDATE**, because 07 §5.2 says
//     links and invites are written only by definer RPCs — and `0012` ships RPCs for the *claim* and the
//     *unlinks* but none for the **mint** or the **revoke**. ★ PIN, recorded in the L-007 entry: `insertInvite`
//     and `updateInvite` therefore run **service**-scoped with the authorisation done in
//     `invite-authorisation.ts` above them. A `0019` should give this cluster `create_child_invite(child_id,
//     direction)` and `revoke_child_invite(invite_id, reason)` as SECURITY DEFINER functions asserting the
//     same two rules in SQL, so the check survives a caller that forgets it. This unit may not write a
//     migration, so the rule lives in one module file and is pinned by test instead.
//   - The three RPCs (`get_invite_preview`, `get_pending_invites_for_recipient`, `connect_child_invite`) run at
//     the scope their grants describe: the preview is the **anon** path and runs `service` because a signed-out
//     visitor has no session to run as; the other two are the caller's own and run `session`.
import type { AppDatabase } from "@/modules/auth";
import type {
  ChildId,
  InviteId,
  Result,
  TableRow,
  UserId,
  Uuid,
} from "@/modules/shared-types";

export type ChildRow = TableRow<AppDatabase, "children">;
export type ChildInsert = AppDatabase["Tables"]["children"]["Insert"];
export type LinkRow = TableRow<AppDatabase, "child_client">;
export type InviteRow = TableRow<AppDatabase, "child_invites">;
export type InviteInsert = AppDatabase["Tables"]["child_invites"]["Insert"];
export type InvitePatch = AppDatabase["Tables"]["child_invites"]["Update"];

/** `get_invite_preview`'s three columns — the only shape an anonymous caller ever receives (02 §7). */
export type PreviewRow = {
  readonly child_first_name: string;
  readonly direction: string;
  readonly invited_by: string;
};

export type PendingInviteRow = {
  readonly invite_id: string;
  readonly child_id: string;
  readonly child_first_name: string;
  readonly direction: string;
  readonly created_at: string;
};

export interface ChildLinkingStore {
  /** Every child this user owns outright (`children.parent_user_id`), oldest first. */
  ownedChildren(parentUserId: UserId): Promise<Result<ReadonlyArray<ChildRow>>>;
  /** Every **active** link row this family is a party to (`child_client`). */
  activeLinks(parentUserId: UserId): Promise<Result<ReadonlyArray<LinkRow>>>;
  childById(childId: ChildId): Promise<Result<ChildRow | null>>;
  /** One link row by its own id — what a claim gets back from `connect_child_invite` and must resolve. */
  linkById(linkId: Uuid): Promise<Result<LinkRow | null>>;
  insertChild(row: ChildInsert): Promise<Result<ChildRow>>;
  invitesForChild(childId: ChildId): Promise<Result<ReadonlyArray<InviteRow>>>;
  inviteById(inviteId: InviteId): Promise<Result<InviteRow | null>>;
  /** Service scope — see the header's ★ pin. */
  insertInvite(row: InviteInsert): Promise<Result<InviteRow>>;
  /** Service scope — see the header's ★ pin. */
  updateInvite(
    inviteId: InviteId,
    patch: InvitePatch,
  ): Promise<Result<InviteRow>>;
  /** RPC `get_invite_preview` (02 §7) — the one anon path; `null` when the token has no pending row. */
  invitePreview(token: string): Promise<Result<PreviewRow | null>>;
  /** RPC `get_pending_invites_for_recipient` (02 §7) — the caller's own, session-scoped. */
  pendingInvites(): Promise<Result<ReadonlyArray<PendingInviteRow>>>;
  /** RPC `connect_child_invite` (02 §7). Raises the five named exceptions; the store carries the code up. */
  connectInvite(token: string, userId: UserId): Promise<Result<Uuid>>;
}
