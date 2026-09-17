// Where a nanny lands after her account exists: `/apply` → the add-child pitch (04 §4.1 row 7, S-N-01); an
// invite → the claim, token-addressed by 04 §2.3 (S-N-20); a bare S-X-07 → the hub, where S-N-22 offers the
// apply road. Paths are app structure, not config (05 §6).
import type { NannySignupPath } from "../types";

const ADD_CHILD = "/nanny/onboarding/add-child";
const HUB = "/nanny";
const CLAIM = "/invite/connect";

export function postNannySignupDestination(input: {
  readonly path: NannySignupPath;
  readonly inviteToken: string | null;
}): string {
  if (input.path === "apply") return ADD_CHILD;
  if (input.inviteToken !== null) return `${CLAIM}/${encodeURIComponent(input.inviteToken)}`;
  return HUB;
}
