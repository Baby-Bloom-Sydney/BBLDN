// **S-X-13** `/invite/[token]` — the child-invite public preview, both directions (04 §6.1). Pure: the states
// and every word on them, so the copy suite reads the *words* and a reword cannot pass by moving a sentence.
//
// 04 §6.1 names five states — valid · claimed · revoked · wrong role · signed-out. They collapse to four here
// and the collapse is deliberate: **claimed and revoked are the same screen**, because `get_invite_preview`
// answers only for `pending` rows and that is the whole enumeration defence (07 §8 row 7). If the page could
// tell a stranger "this one was claimed" and "this one never existed" apart, a script could walk the token
// space for live families. "That link is no longer open" is what both say, and it is also true.
//
// Copy (ADR-124; 00-glossary §6 + P-4). The parent is the hero; BabyBloom is the guide holding the door. There
// is no *free*, no *offer*, no *upgrade*, no *information*, no *continue* — the actions say what they do
// ("Join {child}'s app", "Sign in to join"). The inviter is named because a link from a stranger is a link
// nobody clicks, and `get_invite_preview` returns a first name and nothing else for exactly that reason.
import type { InviteDirection, InvitePreview } from "../types";

export type InviteLandingView =
  | {
      readonly kind: "closed";
      readonly heading: string;
      readonly body: string;
      readonly action: { readonly label: string; readonly href: string };
    }
  | {
      readonly kind: "malformed";
      readonly heading: string;
      readonly body: string;
      readonly action: { readonly label: string; readonly href: string };
    }
  | {
      readonly kind: "failed";
      readonly heading: string;
      readonly body: string;
      readonly action: { readonly label: string; readonly href: string };
    }
  | {
      readonly kind: "open";
      readonly heading: string;
      readonly body: string;
      readonly childFirstName: string;
      readonly direction: InviteDirection;
      /** Signed in as the right role → claim; signed out → sign up or sign in; wrong role → neither. */
      readonly action:
        | { readonly kind: "claim"; readonly label: string }
        | {
            readonly kind: "link";
            readonly label: string;
            readonly href: string;
          }
        | { readonly kind: "none"; readonly label: string };
      readonly secondary?: { readonly label: string; readonly href: string };
    };

export type InviteLandingInput = {
  readonly preview: InvitePreview | null;
  /** `null` signed out. The role decides which side of the invite this visitor can fill. */
  readonly viewerRole: "parent" | "nanny" | "admin" | null;
  readonly tokenWasMalformed: boolean;
  /** True when the lookup itself failed — an outage must never read as "your link was revoked". */
  readonly lookupFailed: boolean;
  readonly signUpHref: string;
  readonly signInHref: string;
};

const HOME = { label: "Go to Baby Bloom", href: "/" } as const;

/** Which role fills which side (02 §3 `invite_direction`): the direction names who is being invited. */
const wantedRole = (direction: InviteDirection): "parent" | "nanny" =>
  direction === "nanny_to_parent" ? "parent" : "nanny";

export function inviteLandingView(
  input: InviteLandingInput,
): InviteLandingView {
  if (input.tokenWasMalformed)
    return {
      kind: "malformed",
      heading: "That link doesn't look right",
      body: "Check the link you were sent — it ends in eight characters with a dash in the middle.",
      action: HOME,
    };

  // An outage and a closed invite are different things and the screen says so. Telling a family whose link is
  // live that it was revoked is the failure that costs the most trust, and it is the one a defaulted
  // "not found" would cause every time the database blinked.
  if (input.lookupFailed)
    return {
      kind: "failed",
      heading: "We couldn't open that link just now",
      body: "Nothing is wrong with your link — we just couldn't reach our records. Try again in a moment.",
      action: HOME,
    };

  if (input.preview === null)
    return {
      kind: "closed",
      heading: "That link is no longer open",
      body: "It may already have been used, or the family may have closed it. Ask whoever sent it to share a new one.",
      action: HOME,
    };

  const { childFirstName, direction, invitedBy } = input.preview;
  const wanted = wantedRole(direction);
  const heading =
    direction === "nanny_to_parent"
      ? `${invitedBy} would like to share ${childFirstName}'s app with you`
      : `${invitedBy} would like you in ${childFirstName}'s app`;
  const body =
    direction === "nanny_to_parent"
      ? `You'll see ${childFirstName}'s days as they happen — what they did, what they're learning, and what comes next.`
      : `You'll share ${childFirstName}'s days with their family — what you did together, and what ${childFirstName} is learning.`;

  if (input.viewerRole === null)
    return {
      kind: "open",
      heading,
      body,
      childFirstName,
      direction,
      action: {
        kind: "link",
        label: `Join ${childFirstName}'s app`,
        href: input.signUpHref,
      },
      secondary: { label: "I already have an account", href: input.signInHref },
    };

  if (input.viewerRole === wanted || input.viewerRole === "admin")
    return {
      kind: "open",
      heading,
      body,
      childFirstName,
      direction,
      action: { kind: "claim", label: `Join ${childFirstName}'s app` },
    };

  return {
    kind: "open",
    heading,
    body,
    childFirstName,
    direction,
    action: {
      kind: "none",
      label:
        wanted === "parent"
          ? "This link is for the child's family. Sign in with that account to join."
          : "This link is for the child's nanny. Sign in with that account to join.",
    },
  };
}
