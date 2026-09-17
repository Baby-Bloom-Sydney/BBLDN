// `03.36` post-signup routing (04 §3.2, §3.3): a position that opened on submit (path B, trigger a) lands on the
// call page S-P-01; an invite-arrived parent (path E) claims the child on S-P-14 and the onboarding call follows
// from there; everyone else (paths A, C, D) lands on the dashboard S-P-03 in state 0 — "create your position to
// connect with nannies" — with the remembered nanny carried so the same nanny shows (path D). Paths are app
// structure, not config (05 §6); the parent routes here are 04 §2.2's.
import type { ParentSignupOutcome, SignupContext } from "../types";

const CALL_PAGE = "/parent/call";
const DASHBOARD = "/parent";
const INVITE_CLAIM = "/invite/connect";

export function postSignupDestination(
  context: Pick<SignupContext, "inviteToken" | "nannyId">,
  positionOpened: boolean,
): ParentSignupOutcome {
  if (positionOpened) return { destination: CALL_PAGE, positionOpened };
  if (context.inviteToken !== undefined)
    return {
      destination: `${INVITE_CLAIM}/${encodeURIComponent(context.inviteToken)}`,
      positionOpened,
    };
  if (context.nannyId !== undefined)
    return {
      destination: `${DASHBOARD}?nanny=${encodeURIComponent(context.nannyId)}`,
      positionOpened,
    };
  return { destination: DASHBOARD, positionOpened };
}
