// `07.50` — the child creation paths. One method, **three** callers: the parent adding a child from the app
// (S-P-13's children card), the "add existing child" step at the end of signup (04 §3; BAI's ruling — the same
// step appears at the end of signup **and** in the portal, so it is one rule with two entry points, never
// two), and — since `2g` — the nanny adding a family she already works for on S-N-01 (04 §4.4 c1).
//
// Three things happen in order and the order is the point:
//   1. the row is written as the actor's own — `parent_user_id` is taken from the actor and never from input,
//      which is the module half of the rule `guard_children_protected_columns` enforces in SQL (S5 closed the
//      hole where a linked nanny could rewrite `parent_user_id` to her own uid; nothing here may reopen it);
//   2. `set_access_window` recomputes the family's grant from the youngest child (ADR-083 / 084) — ★ the call
//      that was owed to this module;
//   3. `startTrial` runs **only if this is the family's first child** (03 §5.4.4, ADR-093).
//
// ★ **Steps 2 and 3 do not run on the nanny's branch, and that is the rule rather than an omission.** A child
// a nanny adds has `parent_user_id is null` — there is no family, so there is no access window to recompute
// (ADR-083 / 084 compute it from a family's youngest child) and no first-child trial to start (ADR-093 ties
// the trial to a family). Both move when that family claims the token, inside `claimInvite`. The row is
// otherwise identical, `created_by_user_id` included: that column is what `0019`'s fourth arm of
// `user_has_child_access()` reads to let her see the row she has just written.
//
// The age cap is `APP.maxChildAgeMonths` from `config` (02 §4.6 puts it "in the module, not in DDL"), read as a
// key and never as a literal (L4). A child past it is `E_CHILD_TOO_OLD` rather than a silent insert, because
// the whole product is bounded by the third birthday and a four-year-old in the table is a support ticket
// nobody can answer.
import { APP } from "@/modules/config";
import { ok } from "@/modules/platform";
import type { Actor, FamilyId, Instant, UserId } from "@/modules/shared-types";
import type { ChildLinkingWrites, NewChild } from "../types";
import { carryLinkStoreError } from "./carry-link-store-error";
import { childCreatorOf } from "./child-creator-of";
import type { ChildLinkingDeps } from "./child-linking-deps";
import { childRecordOf } from "./child-record-of";
import { failChildLinking } from "./fail-child-linking";
import { recomputeAccessWindow } from "./recompute-access-window";
import { startTrialIfFirst } from "./start-trial-if-first";

const MONTHS_IN_YEAR = 12;

/** Whole months between a date of birth and now, in the same arithmetic `set_access_window` implies. */
function ageInMonths(dateOfBirth: string, now: Instant): number {
  const born = new Date(`${dateOfBirth}T00:00:00Z`);
  const at = new Date(now);
  const months =
    (at.getUTCFullYear() - born.getUTCFullYear()) * MONTHS_IN_YEAR +
    (at.getUTCMonth() - born.getUTCMonth());
  return at.getUTCDate() < born.getUTCDate() ? months - 1 : months;
}

/**
 * S-N-01 (04 §4.4 c1). The row is written with **no parent** and with the nanny as its creator; nothing else
 * moves, because nothing else has a family to move for. The invite she mints next is the observable fact
 * (`invite.sent`), and that is deliberate: 03 §9.3's taxonomy is append-only and has no name for "a nanny
 * added an unclaimed child", so `2g` emits none rather than borrowing `app.family-in`, whose subject is a
 * parent who does not exist yet. **Recorded for the planner** (03 §9.3 owns the name).
 */
async function addUnclaimedChild(
  deps: ChildLinkingDeps,
  input: { readonly name: string; readonly child: NewChild },
  creatorUserId: string,
) {
  const written = await deps.store.insertChild({
    parent_user_id: null,
    first_name: input.name,
    date_of_birth: input.child.dateOfBirth,
    created_by_user_id: creatorUserId,
  });
  return written.ok
    ? ok(childRecordOf(written.value))
    : carryLinkStoreError(written.error);
}

/** The family's own child: the row, then the window (ADR-083 / 084), then the first-child trial (ADR-093). */
async function addFamilyChild(
  deps: ChildLinkingDeps,
  input: { readonly name: string; readonly child: NewChild },
  owner: string,
  actor: Actor,
) {
  const familyId = owner as string as FamilyId;
  const existing = await deps.store.ownedChildren(owner as UserId);
  if (!existing.ok) return carryLinkStoreError(existing.error);
  const isFirstChild = existing.value.length === 0;

  const written = await deps.store.insertChild({
    parent_user_id: owner,
    first_name: input.name,
    date_of_birth: input.child.dateOfBirth,
    // 04 §4.4 c1: who created the row. The store writes at service scope (an `insert … returning` on
    // `children` is refused for every client role — `int.rpc-0019`), where `children_stamp_creator` keeps
    // what the caller sends because there is no `auth.uid()` to stamp from. The value is the verified
    // actor's, never an input field, so it is the answer the trigger would have reached under a session.
    created_by_user_id: owner,
  });
  if (!written.ok) return carryLinkStoreError(written.error);

  await recomputeAccessWindow(deps.setAccessWindow, familyId, "createChild");
  await startTrialIfFirst(deps.startTrial, {
    familyId,
    actor,
    isFirstChild,
    action: "createChild",
  });
  await deps.events.emit({
    name: "app.family-in",
    actor,
    subject: { kind: "parent", id: owner },
    props: { childCount: existing.value.length + 1 },
  });
  return ok(childRecordOf(written.value));
}

export function childMethods(
  deps: ChildLinkingDeps,
): Pick<ChildLinkingWrites, "createChild"> {
  return {
    createChild: async (input: NewChild, actor: Actor) => {
      const who = childCreatorOf(actor);
      if (who === null)
        return failChildLinking(
          "E_ACTOR_FORBIDDEN",
          "Only a parent can add a child to their own app.",
        );
      const name = input.firstName.trim();
      if (name.length === 0)
        return failChildLinking(
          "E_CHILD_NOT_FOUND",
          "Tell us your child's first name.",
        );
      const now = deps.now();
      if (ageInMonths(input.dateOfBirth, now) >= APP.maxChildAgeMonths)
        return failChildLinking(
          "E_CHILD_TOO_OLD",
          "The app follows children up to their third birthday.",
        );

      return who.kind === "unclaimed"
        ? addUnclaimedChild(deps, { name, child: input }, who.creatorUserId)
        : addFamilyChild(deps, { name, child: input }, who.parentUserId, actor);
    },
  };
}
