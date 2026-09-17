// Layer 1, role fit (03 §7.2 `roleType`). The `RoleType` vocabulary is a recorded gap (scoring/types.ts), so fit
// is judged on what a candidate snapshot can say: an `attributes.roleType` entry. No stated role = no
// preference = full marks; a stated role the snapshot cannot confirm scores the floor. Points only — the
// vocabulary lands with 03 §12 item 26.
import type { Candidate, PositionInput } from "../../types";

const FULL = 100;
const FLOOR = 20;

export function scoreRoleFit(
  position: PositionInput,
  candidate: Candidate,
): number {
  if (position.requirements.roleType === "") return FULL;
  return candidate.attributes.roleType === true ? FULL : FLOOR;
}
