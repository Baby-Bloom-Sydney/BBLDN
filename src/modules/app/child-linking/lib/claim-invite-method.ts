// `07.51` — the claim. S-P-14 for the parent, S-N-20 for the nanny; one method, because the two sides differ
// only in which half of the invite they fill and `connect_child_invite` already knows which is which (0012 §9).
//
// The order is the contract's (03 §5.4.4) and every step after the first is deliberately unable to undo it:
//   1. **normalise, then claim.** A malformed token never reaches Postgres and never counts against 07 §8 row
//      7's failed-lookup budget as a real miss, because it was never a lookup.
//   2. `connect_child_invite` — one definer call, one transaction: the missing party is filled, the link row is
//      inserted under the one-active-per-child index, `ensure_placement` mints the invite shell so I-3 / I-4
//      hold for a family that arrived sideways (stage-model O-3), the invite is stamped `connected`, and the
//      soft lock clears. Its five named exceptions come back as this module's five reasons.
//   3. ★ `set_access_window` — the ADR-084 call this module owed. The family now has a child; its grant is
//      recomputed from the youngest one.
//   4. `startTrial` **if this is the family's first child** — a done-for-you family answers `E_DFY_FAMILY` and
//      that is not a failure here (ADR-093: her app is already on from the nanny's first day).
//   5. the events, last and post-commit.
//
// Steps 3-5 fail soft. The link is the fact; the window, the trial and the trail are derived from it, and a
// family that has just connected its nanny must not be told the claim failed because a timestamp did not move.
import { ok } from "@/modules/platform";
import type { Actor, ChildId, FamilyId, UserId } from "@/modules/shared-types";
import type { ChildLinkingWrites } from "../types";
import { carryLinkStoreError } from "./carry-link-store-error";
import type { ChildLinkingDeps } from "./child-linking-deps";
import { failChildLinking } from "./fail-child-linking";
import { normaliseInviteToken } from "./normalise-invite-token";
import { recomputeAccessWindow } from "./recompute-access-window";
import { startTrialIfFirst } from "./start-trial-if-first";

const claimantOf = (actor: Actor): UserId | null =>
  actor.kind === "user"
    ? actor.id
    : actor.kind === "admin"
      ? ((actor.onBehalfOf?.id as UserId | undefined) ?? null)
      : null;

export function claimInviteMethod(
  deps: ChildLinkingDeps,
): Pick<ChildLinkingWrites, "claimInvite"> {
  return {
    claimInvite: async (rawToken: string, actor: Actor) => {
      const token = normaliseInviteToken(rawToken);
      if (token === null)
        return failChildLinking(
          "E_INVITE_TOKEN_INVALID",
          "That link doesn't look right. Check it and try again.",
        );
      const claimant = claimantOf(actor);
      if (claimant === null)
        return failChildLinking(
          "E_ACTOR_FORBIDDEN",
          "Sign in to join this child's app.",
        );

      // The preview is read first so the outcome can name the child and the direction without a second
      // round trip after the row has moved to `connected` (at which point the preview answers nothing).
      const preview = await deps.store.invitePreview(token);
      if (!preview.ok) return carryLinkStoreError(preview.error);
      if (preview.value === null)
        return failChildLinking(
          "E_INVITE_NOT_FOUND",
          "That link is no longer open.",
        );
      const direction =
        preview.value.direction === "parent_to_nanny"
          ? ("parent_to_nanny" as const)
          : ("nanny_to_parent" as const);

      const owned =
        direction === "nanny_to_parent"
          ? await deps.store.ownedChildren(claimant)
          : ok([]);
      if (!owned.ok) return carryLinkStoreError(owned.error);
      const isFirstChild = owned.value.length === 0;

      const linkId = await deps.store.connectInvite(token, claimant);
      if (!linkId.ok) return carryLinkStoreError(linkId.error);

      // Whose family is this? On a `nanny_to_parent` claim the claimant is the parent; on the other side the
      // parent is the one already on the child, which the claim has just re-read.
      const link = await deps.store.linkById(linkId.value);
      const familyUserId =
        direction === "nanny_to_parent"
          ? claimant
          : (((link.ok ? link.value?.parent_user_id : null) as UserId | null) ??
            null);
      if (familyUserId === null)
        return failChildLinking(
          "E_STORE",
          "We couldn't finish connecting your app. Try again in a moment.",
        );
      const familyId = familyUserId as string as FamilyId;

      const accessUntil = await recomputeAccessWindow(
        deps.setAccessWindow,
        familyId,
        "claimInvite",
      );
      const trialEndsAt = await startTrialIfFirst(deps.startTrial, {
        familyId,
        actor,
        isFirstChild: direction === "nanny_to_parent" && isFirstChild,
        action: "claimInvite",
      });

      const childId =
        ((link.ok ? link.value?.child_id : null) as ChildId | null) ?? null;
      await deps.events.emit({
        name: "invite.claimed",
        actor,
        subject: { kind: "invite", id: linkId.value as string },
        props: {
          inviteId: linkId.value as string,
          inviterRole:
            direction === "parent_to_nanny"
              ? ("parent" as const)
              : ("nanny" as const),
        },
      });
      await deps.events.emit({
        name:
          direction === "nanny_to_parent" ? "app.family-in" : "app.nanny-in",
        actor,
        subject: { kind: "invite", id: linkId.value as string },
        props: { inviteId: linkId.value as string },
      });

      return ok({
        childId: (childId ?? (linkId.value as string)) as ChildId,
        familyId,
        direction,
        accessUntil,
        trialEndsAt,
      });
    },
  };
}
