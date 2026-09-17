// The `ChildLinkingStore` over `auth`'s data port (01 §6.3; 03 §1.4). Every operation is a `NamedOperation` so
// the port logs and scopes it; nothing here throws across the seam — the port turns a driver throw into an
// `INTERNAL` `Result`.
//
// **Every by-id read is a keyed read (ADR-131 (1), S5b):** `from(name).eq(column, value)` puts the predicate in
// Postgres and brings one family's rows over the wire. There is no whole-table read in this file at all —
// children are the most sensitive rows in the product (07 §3 class H, S3) and a scan that RLS happens to filter
// is still a scan whose correctness depends on the policy rather than on the query.
//
// **The token never appears in a name, a field or a message** (07 §8 row 7: "tokens never in logs"). The two
// operations that take one are named for what they do, not for what they were given.
import type { AppDatabase, DataAccessPort } from "@/modules/auth";
import type { ChildId, InviteId, UserId, Uuid } from "@/modules/shared-types";
import type {
  ChildInsert,
  ChildLinkingStore,
  InviteInsert,
  InvitePatch,
  InviteRow,
  PendingInviteRow,
  PreviewRow,
} from "./child-linking-store";

/** `0019`'s generated argument shapes, so the two enum seams are typed by the migration itself. */
type InviteDirection =
  AppDatabase["Functions"]["create_child_invite"]["Args"]["p_direction"];
type RevokedReason =
  AppDatabase["Functions"]["revoke_child_invite"]["Args"]["p_reason"];

/**
 * The one patch `0019` has a writer for. `revoke_child_invite` takes the reason and stamps the status and the
 * instant itself, so anything else in the patch is a column no function writes — answered `null` and refused
 * by the caller above rather than written behind the definer's back.
 */
const revokeReasonOf = (patch: InvitePatch): RevokedReason | null =>
  patch.status === "revoked" && patch.revoked_reason != null
    ? (patch.revoked_reason as RevokedReason)
    : null;

/**
 * The row after a definer has written it. `null` is not a refusal the caller can act on — the function
 * committed and the row is there — so it is a store failure, carried up as `E_STORE` like any other.
 */
const inviteOrThrow = (row: InviteRow | null): InviteRow => {
  if (row === null)
    throw new Error(
      "child_invites: the row a 0019 definer wrote is not visible",
    );
  return row;
};

export function dbChildLinkingStore(port: DataAccessPort): ChildLinkingStore {
  return Object.freeze({
    ownedChildren: (parentUserId: UserId) =>
      port.run(
        {
          name: "app.childLinking.ownedChildren",
          exec: (q) =>
            q.from("children").eq("parent_user_id", parentUserId).select(),
        },
        { scope: "session" },
      ),
    activeLinks: (parentUserId: UserId) =>
      port.run(
        {
          name: "app.childLinking.activeLinks",
          exec: async (q) => {
            const rows = await q
              .from("child_client")
              .eq("parent_user_id", parentUserId)
              .select();
            return rows.filter((row) => row.state === "active");
          },
        },
        { scope: "session" },
      ),
    childById: (childId: ChildId) =>
      port.run(
        {
          name: "app.childLinking.childById",
          exec: (q) =>
            q
              .from("children")
              .eq("id", childId as string)
              .single(),
        },
        { scope: "session" },
      ),
    activeLinksForChild: (childId: ChildId) =>
      port.run(
        {
          name: "app.childLinking.activeLinksForChild",
          exec: async (q) => {
            const rows = await q
              .from("child_client")
              .eq("child_id", childId as string)
              .select();
            return rows.filter((row) => row.state === "active");
          },
        },
        { scope: "session" },
      ),
    linkById: (linkId: Uuid) =>
      port.run(
        {
          name: "app.childLinking.linkById",
          exec: (q) => q.from("child_client").eq("id", linkId).single(),
        },
        { scope: "session" },
      ),
    // **Service scope, and the reason is measured rather than reasoned (`int.rpc-0019`).** `insert … returning`
    // on `children` is refused for **every** client role, including the child's own parent:
    // `children_access_select` reads `user_has_child_access(id)`, a STABLE definer that queries
    // `public.children`, and a STABLE function sees the statement's start snapshot — so the row being inserted
    // is invisible to it and the RETURNING clause's SELECT check fails. No migration can change that without
    // making the predicate VOLATILE, which would make it unusable as a policy. The module is therefore the
    // writer, at service scope, and `created_by_user_id` travels **with** the insert: `children_stamp_creator`
    // stamps `auth.uid()` only for a non-privileged caller and there is no session here, so a service-scope
    // insert that did not send the column would leave it null for ever (`0019` §4 states exactly this).
    insertChild: (row: ChildInsert) =>
      port.run(
        {
          name: "app.childLinking.insertChild",
          exec: (q) => q.from("children").insert(row),
        },
        { scope: "service" },
      ),
    invitesForChild: (childId: ChildId) =>
      port.run(
        {
          name: "app.childLinking.invitesForChild",
          exec: (q) =>
            q
              .from("child_invites")
              .eq("child_id", childId as string)
              .select(),
        },
        { scope: "session" },
      ),
    inviteById: (inviteId: InviteId) =>
      port.run(
        {
          name: "app.childLinking.inviteById",
          exec: (q) =>
            q
              .from("child_invites")
              .eq("id", inviteId as string)
              .single(),
        },
        { scope: "session" },
      ),
    // **`create_child_invite()` (`0019`), under the caller's own session.** `child_invites` has no client
    // INSERT policy (07 §5.2 — "links and invites written only by the RPCs") and until `0019` there was no RPC
    // to call, so this ran at service scope with `invite-authorisation.ts` as the only gate anything passed
    // through. The definer asserts `mayMint` again in SQL, and it derives its authority from `auth.uid()` and
    // refuses a null one outright — so moving onto it is **not** a rename: the call has to carry the session,
    // and a service-scope call is refused (`INVITE_NO_SESSION`) rather than quietly minting with no authority.
    //
    // `created_by_user_id` on the row is **ignored**: the function stamps `auth.uid()`. Passing it would be a
    // caller naming the creator, which is the spoof `children_stamp_creator` exists to stop one table over.
    //
    // The read-back is a second statement and deliberately so — the function returns the invite's id, and
    // nothing here needs it to be atomic with the mint: `create_child_invite` is idempotent on the one pending
    // invite per (child, direction), so a retry after a failed read returns the same id and the same token.
    insertInvite: (row: InviteInsert) =>
      port.run(
        {
          name: "app.childLinking.insertInvite",
          exec: async (q) => {
            const id = (await q.rpc("create_child_invite", {
              p_child_id: row.child_id,
              p_direction: row.direction as InviteDirection,
              p_token: row.token,
            })) as string;
            return inviteOrThrow(
              await q.from("child_invites").eq("id", id).single(),
            );
          },
        },
        { scope: "session" },
      ),
    // **`revoke_child_invite()` (`0019`), under the caller's own session**, for the same reason as the mint.
    // The function is the *only* invalidation path a token has (there is no rotation and no expiry — `0012`'s
    // own assertion), so a patch that is not a revoke has no writer at all and is refused here rather than
    // falling back to the table write this unit exists to close. Nothing in the module sends one.
    //
    // A terminal invite is `false` from the function and no write; the row is read back either way, so the
    // caller sees what stands rather than what it asked for.
    updateInvite: (inviteId: InviteId, patch: InvitePatch) =>
      port.run(
        {
          name: "app.childLinking.updateInvite",
          exec: async (q) => {
            const reason = revokeReasonOf(patch);
            if (reason === null)
              throw new Error(
                "child_invites has no writer but revoke_child_invite (0019 §5)",
              );
            await q.rpc("revoke_child_invite", {
              p_invite_id: inviteId as string,
              p_reason: reason,
            });
            return inviteOrThrow(
              await q
                .from("child_invites")
                .eq("id", inviteId as string)
                .single(),
            );
          },
        },
        { scope: "session" },
      ),
    invitePreview: (token: string) =>
      port.run(
        {
          name: "app.childLinking.invitePreview",
          exec: async (q) => {
            const rows = (await q.rpc("get_invite_preview", {
              p_token: token,
            })) as ReadonlyArray<PreviewRow> | null;
            return rows === null || rows.length === 0 ? null : rows[0];
          },
        },
        // The anon path (02 §7): a signed-out visitor has no session to run as. The RPC itself returns three
        // columns and no id, so the widening is the function's, not this scope's.
        { scope: "service" },
      ),
    pendingInvites: () =>
      port.run(
        {
          name: "app.childLinking.pendingInvites",
          exec: async (q) => {
            // The function takes no arguments; the generated `Args` for a nullary RPC is the empty record,
            // which TypeScript narrows to `never` unless it is named as such at the call site.
            const rows = (await q.rpc(
              "get_pending_invites_for_recipient",
              {} as never,
            )) as ReadonlyArray<PendingInviteRow> | null;
            return rows ?? [];
          },
        },
        { scope: "session" },
      ),
    connectInvite: (token: string, userId: UserId) =>
      port.run(
        {
          name: "app.childLinking.connectInvite",
          exec: async (q) =>
            (await q.rpc("connect_child_invite", {
              p_token: token,
              p_user_id: userId as string,
            })) as Uuid,
        },
        { scope: "session" },
      ),
  }) satisfies ChildLinkingStore;
}
