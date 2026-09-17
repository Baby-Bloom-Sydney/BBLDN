"use server";
// S-A-04 "mark done + outcome" (04 §6.4; 04 §5.2 step 6) — row 3 of the stage table, the only new mechanism in
// Phase 1.
//
// `no-answer` is C-5, not C-3: the booking closes `no-answer` and the call goes back to `awaiting-slot` for a
// retry, which the admin books on behalf or the parent picks again (R5; ADR-073). `call-layer` makes that
// choice from the outcome — this action never picks a transition itself.
//
// Every write goes **through** `admin-on-behalf`, never around it: its gate is what turns a session into an
// admin actor and stamps `onBehalfOf` on the event (FIX-1; 07 §5.4 rows 1–2, 6).
import { adminOnBehalf } from "@/modules/admin-on-behalf";
import { ok, toActionResult } from "@/modules/platform";
import type { RecordCallOutcomeAction } from "../types";
import { callRefOf } from "../lib/call-ref-of";
import { malformedRequest } from "../../lib/malformed-request";
import { parsePartyRef } from "../lib/parse-party-ref";
import { partyActor } from "../lib/party-actor";

const OUTCOMES = new Set([
  "proceeding",
  "not-now",
  "not-proceeding",
  "no-answer",
  "cancelled",
]);

export const recordCallOutcomeAction: RecordCallOutcomeAction = async (
  input,
) => {
  // The boundary, before anything is derived from the body (security review, MEDIUM). The outcome is checked
  // against 03 §2.7's enum here as well as by the type, because the type is not present at run time and an
  // unknown outcome would otherwise reach `call-layer`'s transition choice.
  const ref = parsePartyRef(input?.ref);
  if (ref === null || !OUTCOMES.has(input?.outcome))
    return toActionResult(malformedRequest());
  const moved = await adminOnBehalf.recordOutcome(
    callRefOf(ref),
    input.outcome,
    input.notes,
    partyActor(ref),
  );
  return toActionResult(moved.ok ? ok(undefined) : moved);
};
