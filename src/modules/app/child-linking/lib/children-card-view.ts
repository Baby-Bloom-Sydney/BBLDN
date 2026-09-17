// **S-P-13's children card on `/parent`** (04 §6.2 — "no child yet → add / invite · trial · active · lapsed
// (paywall) · pending invite"). Pure, and it is where BAI's ruling lands: the "add a child" step exists at the
// **end of signup and in the portal**, so it is one rule with two entry points — this card and the signup step
// render the same view rather than two copies that drift.
//
// The card is composed over `appAccessView`, so a closed or unknown gate is decided in one place and this file
// only chooses what a family with access is looking at:
//
//   no child        → add a child (the same step signup ends on)
//   child, no nanny → share the app with the nanny (mint or copy the link — no rotation, so "copy" is honest)
//   invite pending  → the link is out; show it again, and say who it is waiting on
//   nanny linked    → the app, per child
//
// Copy (ADR-124). *Invite* is not a banned word and is the one the product actually uses; *share* carries the
// feeling better on the action, so the heading invites and the button shares. No *free*, no *upgrade*, no
// *information*, no *continue* — and the empty state is never "you have no children", which reads as a
// reprimand for not having finished a form.
import type { ChildInvite, ChildRecord } from "../types";
import type { AccessFacts, AppAccessView } from "./app-access-view";
import { appAccessView } from "./app-access-view";

export type ChildrenCardView =
  | { readonly kind: "gate"; readonly gate: AppAccessView }
  | {
      readonly kind: "no-child";
      readonly heading: string;
      readonly body: string;
      readonly action: string;
    }
  | {
      readonly kind: "children";
      readonly heading: string;
      readonly rows: ReadonlyArray<ChildCardRow>;
      readonly addAction: string;
    };

export type ChildCardRow = {
  readonly childId: string;
  readonly firstName: string;
  readonly href: string;
  readonly state: "no-nanny" | "invite-pending" | "nanny-linked";
  readonly line: string;
  /** Present only while an invite for this child is pending — the same link, never a new one. */
  readonly shareUrl?: string;
  readonly action: string;
};

const lineFor = (
  state: ChildCardRow["state"],
  firstName: string,
): { readonly line: string; readonly action: string } => {
  if (state === "nanny-linked")
    return {
      line: `You and your nanny are both in ${firstName}'s app.`,
      action: `Open ${firstName}'s app`,
    };
  if (state === "invite-pending")
    return {
      line: `Your nanny's link is ready — it's waiting for her to join.`,
      action: "Copy the link again",
    };
  return {
    line: `Share ${firstName}'s app with your nanny and you'll both see the same days.`,
    action: "Share with your nanny",
  };
};

export function childrenCardView(input: {
  readonly access: AccessFacts | null;
  readonly children: ReadonlyArray<ChildRecord>;
  readonly invites: ReadonlyArray<ChildInvite>;
  readonly linkedChildIds: ReadonlyArray<string>;
}): ChildrenCardView {
  const gate = appAccessView({
    access: input.access,
    children: input.children,
  });
  if (gate.kind !== "open") return { kind: "gate", gate };

  if (input.children.length === 0)
    return {
      kind: "no-child",
      heading: "Add your child",
      body: "Tell us their name and birthday and their app is ready — the feed, what they're learning, and Katie beside you.",
      action: "Add your child",
    };

  const linked = new Set(input.linkedChildIds);
  const pending = new Map(
    input.invites
      .filter((invite) => invite.status === "pending")
      .map((invite) => [invite.childId as string, invite] as const),
  );

  const rows = input.children.map((child): ChildCardRow => {
    const id = child.id as string;
    const state: ChildCardRow["state"] = linked.has(id)
      ? "nanny-linked"
      : pending.has(id)
        ? "invite-pending"
        : "no-nanny";
    const { line, action } = lineFor(state, child.firstName);
    const shareUrl = pending.get(id)?.url;
    return Object.freeze({
      childId: id,
      firstName: child.firstName,
      href: `/parent/development/${id}`,
      state,
      line,
      action,
      ...(shareUrl === undefined ? {} : { shareUrl }),
    });
  });

  return {
    kind: "children",
    heading: input.children.length === 1 ? "Your child" : "Your children",
    rows: Object.freeze(rows),
    addAction: "Add another child",
  };
}
