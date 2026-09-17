// **ADR-145 (1)** — is this position the named parent's? The membership check M-3 found missing.
//
// `onBehalfOf`'s *presence* was already required (`gated-admin-actor.ts`, security review M1); its *membership*
// never was, so an admin action could be handed a `positionId` and a `parentId` that have nothing to do with
// each other and would record the second as the audit subject of a move against the first.
//
// It reads through the `positions` connector — the only road `admin` has to a position (03 §3.6: "`scheduling`
// returns ids, `admin` decorates", and `load-call-queue.ts` already reads the same method). A read that does not
// answer is a refusal, never a pass: a check that fails open is not a check.
import { ok } from "@/modules/platform";
import { positions } from "@/modules/positions";
import type { PositionId, Result } from "@/modules/shared-types";
import { subjectMismatch } from "../../lib/subject-mismatch";

export async function positionBelongsTo(
  positionId: string,
  parentId: string,
): Promise<Result<void>> {
  const read = await positions.getForMatching(positionId as PositionId);
  if (!read.ok) return read;
  return (read.value.parentId as string) === parentId
    ? ok(undefined)
    : subjectMismatch("parentId");
}
