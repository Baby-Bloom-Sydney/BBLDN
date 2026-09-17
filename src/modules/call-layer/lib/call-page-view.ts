// S-P-01's view model from the parent's open call (04 §6.2 S-P-01 states): the plain matchmaking page, the
// after-Connect variant naming the nanny (trigger (c)), the onboarding variant (path E), and the page after a
// no-answer ("we'll try again — pick a time"). The chosen time rides along while `slot-chosen`.
import type { CallPageVariant, CallPageView, OpenCall } from "../types";

const variantOf = (call: OpenCall): CallPageVariant => {
  if (call.type === "onboarding") return "onboarding";
  if (call.afterNoAnswer) return "after-no-answer";
  if (call.aboutNanny !== undefined) return "after-connect";
  return "matchmaking";
};

export function callPageView(call: OpenCall): CallPageView {
  const chosen =
    call.state === "slot-chosen" && call.booking !== undefined
      ? { start: call.booking.start, end: call.booking.end }
      : undefined;
  return Object.freeze({
    positionId: call.positionId,
    state: call.state,
    variant: variantOf(call),
    ...(call.aboutNanny === undefined ? {} : { aboutNanny: call.aboutNanny }),
    ...(chosen === undefined ? {} : { chosen }),
  });
}
