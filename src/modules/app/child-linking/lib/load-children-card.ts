// S-P-13's children-card server read (05 §7 rule 5). The gate's answer arrives as an **argument**, not a read:
// 01 §2.3 lets nothing but itself import `access-gate`, so the page asks the gate and hands the two fields
// down. `null` means "we could not tell" and is carried through untouched — the whole point of `1h`'s
// fail-closed-by-carrying-the-error is that this layer can still tell an outage from a closed account.
import { log } from "@/modules/platform";
import { childLinking } from "./default-child-linking";
import { appActor } from "./app-actor";
import type { AccessFacts } from "./app-access-view";
import { childrenCardView } from "./children-card-view";
import type { ChildrenCardView } from "./children-card-view";
import type { ChildInvite, ChildRecord } from "../types";
import type { FamilyId } from "@/modules/shared-types";

export async function loadChildrenCard(
  access: AccessFacts | null,
): Promise<ChildrenCardView | null> {
  const actor = await appActor();
  if (actor === null || actor.kind !== "user" || actor.role !== "parent")
    return null;
  const familyId = actor.id as string as FamilyId;

  const [children, links] = await Promise.all([
    childLinking.childrenOfFamily(familyId),
    childLinking.linkedChildren(familyId),
  ]);
  // A read that refused is not a family with no children. It is the `unknown` gate state, which is what a
  // `null` access fact already renders — so the card asks for that rather than inventing an empty list.
  if (!children.ok)
    return childrenCardView({
      access: null,
      children: [],
      invites: [],
      linkedChildIds: [],
    });

  const rows: ReadonlyArray<ChildRecord> = children.value;
  const invites: ChildInvite[] = [];
  for (const child of rows) {
    const found = await childLinking.invitesForChild(child.id, actor);
    if (found.ok) invites.push(...found.value);
    // ★ REVIEW-2 (silent-failure HIGH). The refusal used to be dropped per child, with the same care the
    // `!children.ok` branch above takes simply not applied here. The cost is not cosmetic: a parent with a
    // pending invite is shown "no invites" and prompted to invite again, and `child_invites` carries no expiry
    // (02 §4.6), so the encouraged retry mints a second live token for the same child. The card still renders —
    // a missing invite is not worth blanking the screen — but the read is no longer invisible.
    else
      log.error("children card: a child's invites did not answer", {
        module: "app",
        action: "loadChildrenCard",
        alert: "ALERT_PROVIDER_DOWN",
        surface: "S-P-13",
        reason: found.error.details?.reason ?? found.error.code,
      });
  }
  if (!links.ok)
    // Same class: a refused link read renders a linked child as unlinked, which is the state that offers the
    // parent an invite she does not need.
    log.error("children card: the linked-children read did not answer", {
      module: "app",
      action: "loadChildrenCard",
      alert: "ALERT_PROVIDER_DOWN",
      surface: "S-P-13",
      reason: links.error.details?.reason ?? links.error.code,
    });

  return childrenCardView({
    access,
    children: rows,
    invites,
    linkedChildIds: links.ok
      ? links.value
          .filter((link) => link.linkedNannyIds.length > 0)
          .map((link) => link.childId as string)
      : [],
  });
}
