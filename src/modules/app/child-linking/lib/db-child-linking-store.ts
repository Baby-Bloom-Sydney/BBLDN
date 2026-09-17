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
import type { DataAccessPort } from "@/modules/auth";
import type { ChildId, InviteId, UserId, Uuid } from "@/modules/shared-types";
import type {
  ChildInsert,
  ChildLinkingStore,
  InviteInsert,
  InvitePatch,
  PendingInviteRow,
  PreviewRow,
} from "./child-linking-store";

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
    linkById: (linkId: Uuid) =>
      port.run(
        {
          name: "app.childLinking.linkById",
          exec: (q) => q.from("child_client").eq("id", linkId).single(),
        },
        { scope: "session" },
      ),
    insertChild: (row: ChildInsert) =>
      port.run(
        {
          name: "app.childLinking.insertChild",
          exec: (q) => q.from("children").insert(row),
        },
        { scope: "session" },
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
    // Service scope — `child_invites` has no client INSERT policy (07 §5.2) and `0012` ships no mint RPC.
    // The ★ pin in `child-linking-store.ts` names the `0019` function that should take this over.
    insertInvite: (row: InviteInsert) =>
      port.run(
        {
          name: "app.childLinking.insertInvite",
          exec: (q) => q.from("child_invites").insert(row),
        },
        { scope: "service" },
      ),
    updateInvite: (inviteId: InviteId, patch: InvitePatch) =>
      port.run(
        {
          name: "app.childLinking.updateInvite",
          exec: (q) =>
            q.from("child_invites").update(inviteId as string as Uuid, patch),
        },
        { scope: "service" },
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
