// S-N-01's two sets of words (04 §4.1 row 8; 04 §6.3 S-N-01 "active · passive"; 04 §8 anchor "Get paid for
// adding existing clients.").
//
// The signal behind them is the under-3 answer N1 captured and **never shows her** (04 §4.1 row 5), read off her
// own lead row by `nannyAccountStore.get()` (kickoff debt 14). This file only chooses words from it.
//
// Two rules, both deliberate.
//
//   **Active is the default.** `undefined` means "we do not know" — an account made before the funnel captured
//   the signal, or an invited nanny, who has no lead at all — and the planner's ruling is that those read the
//   active wording. Absent is not "no", and the cost of being wrong the other way is a screen telling a nanny
//   who is with a baby today that this is for some later time.
//
//   **Neither variant is a gate.** The passive words change the framing, never the offer: the form is the same
//   form and the heading is 04 §8's anchor in both. A nanny who works with older children may well know a
//   family with a baby, and refusing her would be inventing a rule no document states.
import type { AddChildPitchCopy } from "../types";

const HEADING = "Get paid for adding existing clients.";
const FORM_HEADING = "Add a family you work for";

const ACTIVE: AddChildPitchCopy = Object.freeze({
  variant: "active",
  heading: HEADING,
  lead: "Already with a family? Add their child here and we'll make you a link to pass on. If they come on board, we arrange a commission with you personally — agreed on a short call, not worked out on a screen.",
  second:
    "The family gets the app for their child: their days, what their child is doing and what comes next, shared with you.",
  formHeading: FORM_HEADING,
});

const PASSIVE: AddChildPitchCopy = Object.freeze({
  variant: "passive",
  heading: HEADING,
  lead: "When you're with a family whose child is under three, you can add them here and we'll make you a link to pass on. If they come on board, we arrange a commission with you personally — agreed on a short call, not worked out on a screen.",
  second:
    "The family gets the app for their child: their days, what their child is doing and what comes next, shared with you. Keep this page — it's here whenever a family comes up.",
  formHeading: FORM_HEADING,
});

export function addChildPitchCopy(
  worksWithUnderThrees: boolean | undefined,
): AddChildPitchCopy {
  return worksWithUnderThrees === false ? PASSIVE : ACTIVE;
}
