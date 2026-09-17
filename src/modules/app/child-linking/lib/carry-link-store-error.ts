// A store failure re-told in this module's vocabulary, with one deliberate translation: `connect_child_invite`
// raises five **named** exceptions (0012 §9) and they are the difference between "this link is not yours" and
// "the database is down". The port flattens a driver throw to `INTERNAL` and puts the text in the message, so
// the names are matched here — by exact token, on word boundaries, so a message that merely contains the word
// "invite" is not mistaken for one — and anything unrecognised stays `E_STORE`.
//
// The mapping is the RPC's, not a guess: `INVITE_NOT_FOUND` covers a revoked or already-claimed token as well
// as a made-up one, because the function selects `status = 'pending'` and the landing page must not be able to
// tell those apart for a token the caller does not hold (07 §8 row 7's enumeration argument).
import type { ChildLinkingErrorReason } from "../types";
import { failChildLinking } from "./fail-child-linking";

const NAMED: ReadonlyArray<readonly [string, ChildLinkingErrorReason, string]> =
  Object.freeze([
    ["INVITE_NOT_FOUND", "E_INVITE_NOT_FOUND", "That link is no longer open."],
    [
      "INVITE_NOT_YOURS",
      "E_INVITE_NOT_YOURS",
      "That link was sent to someone else.",
    ],
    [
      "INVITE_WRONG_ROLE",
      "E_INVITE_WRONG_ROLE",
      "That link is for the other side of the app.",
    ],
    [
      "CHILD_ALREADY_CLAIMED",
      "E_CHILD_ALREADY_CLAIMED",
      "Another family already has this child.",
    ],
    [
      "CHILD_ALREADY_LINKED",
      "E_CHILD_ALREADY_LINKED",
      "This child already has a nanny in the app.",
    ],
    [
      "INVITE_SELF_CLAIM",
      "E_INVITE_WRONG_ROLE",
      "That link is for the other side of the app.",
    ],
    ["INVITE_INCOMPLETE", "E_INVITE_NOT_FOUND", "That link is no longer open."],
  ] as const);

export function carryLinkStoreError(error: { readonly message?: string }) {
  const message = error.message ?? "";
  for (const [name, reason, sentence] of NAMED)
    if (new RegExp(`\\b${name}\\b`).test(message))
      return failChildLinking(reason, sentence);
  return failChildLinking(
    "E_STORE",
    "We couldn't reach your app records just now. Try again in a moment.",
  );
}
