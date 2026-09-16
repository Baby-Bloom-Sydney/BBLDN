// Layer 1, support fit (03 §7.2 `supportNeeds`): no stated need = full marks; a need the snapshot confirms
// (`attributes.supportNeeds === true`) = full marks; otherwise the floor. Same reading as role fit.
import type { Candidate, PositionInput } from "../../types";

const FULL = 100;
const FLOOR = 30;

export function scoreSupportFit(
  position: PositionInput,
  candidate: Candidate,
): number {
  const needs = position.requirements.supportNeeds ?? [];
  if (needs.length === 0) return FULL;
  return candidate.attributes.supportNeeds === true ? FULL : FLOOR;
}
