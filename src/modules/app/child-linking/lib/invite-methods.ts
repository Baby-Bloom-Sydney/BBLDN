// `02.16` — the child invite links: mint, revoke, list. The token rules are 02 §4.6's and they are absolute:
// `XXXX-XXXX`, the hyphen stored and in the URL, **no rotation while pending**, and revoke as the only
// invalidation path (memory `project_invite_token_format` / `_stability`).
//
// `createInvite` is therefore **idempotent, not regenerating**: a pending row for this (child, direction) is
// returned as it stands. That is what "resend" means on S-A-11 (`09.28`) — the same link, sent again — and it
// is why the method cannot be used to cycle a token a recipient already holds. `0012`'s
// `child_invites_one_pending_per_direction_idx` says the same thing in SQL; the check here is the one that
// returns the existing row instead of a unique violation.
//
// The mint retries on a token collision rather than trusting one draw. At 32^8 a clash is vanishingly rare, but
// `token` is `unique` and a rare unhandled failure on a share link is a support call nobody can reproduce.
import { ok } from "@/modules/platform";
import type { Actor, ChildId, InviteId, UserId } from "@/modules/shared-types";
import type {
  ChildLinkingLookups,
  ChildLinkingWrites,
  InviteDirection,
  InviteRevokedReason,
} from "../types";
import { carryLinkStoreError } from "./carry-link-store-error";
import type { ChildLinkingDeps } from "./child-linking-deps";
import { childInviteOf } from "./child-invite-of";
import { failChildLinking } from "./fail-child-linking";
import { inviteAuthorisation } from "./invite-authorisation";
import { mintInviteToken } from "./mint-invite-token";

const MINT_ATTEMPTS = 5;

const actingUserId = (actor: Actor): string | null =>
  actor.kind === "user"
    ? (actor.id as string)
    : actor.kind === "admin"
      ? ((actor.onBehalfOf?.id as string | undefined) ?? null)
      : null;

export function inviteMethods(
  deps: ChildLinkingDeps,
): Pick<ChildLinkingWrites, "createInvite" | "revokeInvite"> &
  Pick<ChildLinkingLookups, "invitesForChild"> {
  const invitesOf = async (childId: ChildId) => {
    const rows = await deps.store.invitesForChild(childId);
    return rows.ok
      ? ok(rows.value.map((row) => childInviteOf(row, deps.inviteBaseUrl)))
      : carryLinkStoreError(rows.error);
  };

  return {
    invitesForChild: async (childId: ChildId, actor: Actor) => {
      const child = await deps.store.childById(childId);
      if (!child.ok) return carryLinkStoreError(child.error);
      if (child.value === null)
        return failChildLinking(
          "E_CHILD_NOT_FOUND",
          "We can't find that child.",
        );
      const id = actingUserId(actor);
      // ★ M-6 (REVIEW-2). Security review M1 put `actor.onBehalfOf !== undefined` on mint and revoke
      // (`invite-authorisation.ts`) and left the **read** as "any admin" — and this read answers with the full
      // share URL, token included, for any `childId`. Same class, and an un-attributable read of a live token
      // is the one thing the token's stability (no expiry, no rotation — 02 §4.6) cannot absorb. An admin acts
      // on behalf of a named person or not at all (03 §2.5).
      const mine =
        (actor.kind === "admin" && actor.onBehalfOf !== undefined) ||
        (id !== null && child.value.parent_user_id === id);
      if (!mine)
        return failChildLinking(
          "E_ACTOR_FORBIDDEN",
          "That child isn't on your app.",
        );
      return invitesOf(childId);
    },

    createInvite: async (
      childId: ChildId,
      direction: InviteDirection,
      actor: Actor,
    ) => {
      const child = await deps.store.childById(childId);
      if (!child.ok) return carryLinkStoreError(child.error);
      if (child.value === null)
        return failChildLinking(
          "E_CHILD_NOT_FOUND",
          "We can't find that child.",
        );

      // Keyed on the **child**, not on the family. A `nanny_to_parent` invite exists exactly when the child
      // has no parent yet, so the family's key is null there and the old lookup matched nothing at all —
      // which made a linked nanny's branch of `mayMint` unreachable (security review M3).
      const links = await deps.store.activeLinksForChild(childId);
      if (!links.ok) return carryLinkStoreError(links.error);
      const allowed = inviteAuthorisation.mayMint(actor, direction, {
        parentUserId: (child.value.parent_user_id as UserId | null) ?? null,
        // `0019`'s creator arm (04 §4.4 c1): the nanny who added an existing family's child may mint their
        // token before any link row exists — which is the whole of S-N-01. `create_child_invite()` reads the
        // same column for the same branch, so the two gates cannot disagree.
        createdByUserId:
          (child.value.created_by_user_id as UserId | null) ?? null,
        linkedNannyUserIds: links.value.map(
          (row) => row.nanny_user_id as UserId,
        ),
      });
      if (!allowed)
        return failChildLinking(
          "E_ACTOR_FORBIDDEN",
          "Only this child's family can share their app.",
        );

      const existing = await deps.store.invitesForChild(childId);
      if (!existing.ok) return carryLinkStoreError(existing.error);
      const pending = existing.value.find(
        (row) => row.direction === direction && row.status === "pending",
      );
      // No rotation. The same link, handed over again — which is exactly what "resend" is (S-A-11).
      if (pending !== undefined)
        return ok(childInviteOf(pending, deps.inviteBaseUrl));

      const createdBy = actingUserId(actor);
      let lastError: { readonly message?: string } | null = null;
      for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
        const written = await deps.store.insertInvite({
          child_id: childId as string,
          token: mintInviteToken(),
          direction,
          created_by_user_id: createdBy,
        });
        if (written.ok) {
          const made = childInviteOf(written.value, deps.inviteBaseUrl);
          // 03 §9.3 "App / invite": ids only. The token is NOT a prop — an event log is a place a token would
          // outlive its invite, and `props` is explicitly "ids only, no PII" (02 §4.6 `events`).
          await deps.events.emit({
            name: "invite.sent",
            actor,
            subject: { kind: "invite", id: made.id as string },
            props: {
              inviteId: made.id as string,
              inviterRole: direction === "parent_to_nanny" ? "parent" : "nanny",
            },
          });
          return ok(made);
        }
        lastError = written.error;
      }
      return carryLinkStoreError(lastError ?? {});
    },

    revokeInvite: async (
      inviteId: InviteId,
      reason: InviteRevokedReason,
      actor: Actor,
    ) => {
      const row = await deps.store.inviteById(inviteId);
      if (!row.ok) return carryLinkStoreError(row.error);
      if (row.value === null)
        return failChildLinking(
          "E_INVITE_NOT_FOUND",
          "That link is no longer open.",
        );
      if (
        !inviteAuthorisation.mayRevoke(
          actor,
          (row.value.created_by_user_id as UserId | null) ?? null,
        )
      )
        return failChildLinking(
          "E_ACTOR_FORBIDDEN",
          "Only whoever shared this link can close it.",
        );
      if (row.value.status !== "pending")
        return ok(childInviteOf(row.value, deps.inviteBaseUrl));

      const patched = await deps.store.updateInvite(inviteId, {
        status: "revoked",
        revoked_at: deps.now(),
        revoked_reason: reason,
      });
      return patched.ok
        ? ok(childInviteOf(patched.value, deps.inviteBaseUrl))
        : carryLinkStoreError(patched.error);
    },
  };
}
