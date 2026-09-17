"use server";
// S-X-03's progressive save (04 §6.1; 02 §4.7 `saveParentLead`). Validated once at the boundary (01 §4a); the
// lead id is client-minted (02 §4.7) and checked to be a uuid so a crafted id cannot become a row key. Answers
// through `ClientResult` (01 §4e) — the wizard keeps going in memory when the save fails closed and retries at
// the end; the parent never sees the reason.
import { toActionResult } from "@/modules/platform";
import { err, ok } from "@/modules/platform";
import type { ClientResult } from "@/modules/platform";
import type { LeadId } from "@/modules/shared-types";
import { matching } from "../lib/default-matching";
import { parseWizardAnswers } from "../lib/wizard-answers-schema";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_MAX = 32;

export type SaveParentLeadPayload = {
  readonly leadId: string;
  readonly answers: unknown;
  readonly source: string | null;
  readonly completed: boolean;
};

export async function saveParentLeadAction(
  payload: SaveParentLeadPayload,
): Promise<ClientResult<void>> {
  const answers = parseWizardAnswers(payload.answers);
  if (!UUID.test(payload.leadId) || answers === null)
    return toActionResult(
      err("VALIDATION", "Those answers could not be saved.", {
        reason: "invalid-input",
      }),
    );
  const source =
    typeof payload.source === "string"
      ? payload.source.slice(0, SOURCE_MAX)
      : null;
  const saved = await matching.saveLead({
    id: payload.leadId as LeadId,
    answers,
    source,
    completed: payload.completed === true,
  });
  return toActionResult(saved.ok ? ok(undefined) : saved);
}
