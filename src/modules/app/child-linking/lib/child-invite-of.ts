// One row of `child_invites` as the module's vocabulary, plus the share URL built from `URLS.invite` (ADR-033 /
// L4 — the domain is config's, never a literal in a rule or a screen).
//
// The token is on the object because the family has to be able to copy the link; what the *screens* do with it
// is bounded elsewhere (04 §6.4 S-A-11 shows it to the admin who minted it; the recipient's pending card keys
// on `inviteId` and never receives the token). 07 §8 row 7's rule — tokens never in logs — is the store's and
// the logger's, not this shape's.
import type { ChildId, InviteId, Instant } from "@/modules/shared-types";
import type { ChildInvite, InviteDirection, InviteStatus } from "../types";
import type { InviteRow } from "./child-linking-store";

export const childInviteOf = (row: InviteRow, base: string): ChildInvite =>
  Object.freeze({
    id: row.id as InviteId,
    childId: row.child_id as ChildId,
    token: row.token,
    direction: row.direction as InviteDirection,
    status: row.status as InviteStatus,
    createdAt: row.created_at as Instant,
    url: `${base}/${row.token}`,
  });
