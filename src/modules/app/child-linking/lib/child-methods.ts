// `07.50` — the child creation paths. One method, two callers: the parent adding a child from the app (S-P-13's
// children card) and the "add existing child" step at the end of signup (04 §3; BAI's ruling — the same step
// appears at the end of signup **and** in the portal, so it is one rule with two entry points, never two).
//
// Three things happen in order and the order is the point:
//   1. the row is written as the actor's own — `parent_user_id` is taken from the actor and never from input,
//      which is the module half of the rule `guard_children_protected_columns` enforces in SQL (S5 closed the
//      hole where a linked nanny could rewrite `parent_user_id` to her own uid; nothing here may reopen it);
//   2. `set_access_window` recomputes the family's grant from the youngest child (ADR-083 / 084) — ★ the call
//      that was owed to this module;
//   3. `startTrial` runs **only if this is the family's first child** (03 §5.4.4, ADR-093).
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

const ownerOf = (actor: Actor): string | null =>
  actor.kind === "user" && actor.role === "parent"
    ? (actor.id as string)
    : actor.kind === "admin" && actor.onBehalfOf?.role === "parent"
      ? (actor.onBehalfOf.id as string)
      : null;

export function childMethods(
  deps: ChildLinkingDeps,
): Pick<ChildLinkingWrites, "createChild"> {
  return {
    createChild: async (input: NewChild, actor: Actor) => {
      const owner = ownerOf(actor);
      if (owner === null)
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

      const familyId = owner as string as FamilyId;
      const existing = await deps.store.ownedChildren(owner as UserId);
      if (!existing.ok) return carryLinkStoreError(existing.error);
      const isFirstChild = existing.value.length === 0;

      const written = await deps.store.insertChild({
        parent_user_id: owner,
        first_name: name,
        date_of_birth: input.dateOfBirth,
        // 04 §4.4 c1: who created the row. The store writes at service scope (an `insert … returning` on
        // `children` is refused for every client role — `int.rpc-0019`), where `children_stamp_creator` keeps
        // what the caller sends because there is no `auth.uid()` to stamp from. The value is the verified
        // actor's, never an input field, so it is the answer the trigger would have reached under a session.
        created_by_user_id: owner,
      });
      if (!written.ok) return carryLinkStoreError(written.error);

      await recomputeAccessWindow(
        deps.setAccessWindow,
        familyId,
        "createChild",
      );
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
    },
  };
}
