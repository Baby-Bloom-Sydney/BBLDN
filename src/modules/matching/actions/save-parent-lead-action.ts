"use server";
// S-X-03's progressive save (04 §6.1; 02 §4.7 `saveParentLead`). Validated once at the boundary (01 §4a); the
// lead id is client-minted (02 §4.7) and checked to be a uuid so a crafted id cannot become a row key. Answers
// through `ClientResult` (01 §4e) — the wizard keeps going in memory when the save fails closed and retries at
// the end; the parent never sees the reason.
//
// ★ **07 §8 row 2 is consumed here (REVIEW-2 M-5; ADR-140 (3)).** This is an anonymous `"use server"` export that
// writes a `parent_leads` row of a stranger's answers, and it shipped with no ceiling at all — row 2 names 10 a
// minute for exactly this surface, and the policy sat declared in `config/security.ts` with no call site, which
// reads as protection in force and is not (ADR-142 (2)). The limit runs **after** the zod parse, so a malformed
// payload does not spend a caller's budget, and **before** the write. It fails **closed**: the fail-open
// allow-list of ADR-134 carries `publicRead` alone, and this is a write.
import { headers } from "next/headers";
import { z } from "zod";
import { toActionResult } from "@/modules/platform";
import { err, ok } from "@/modules/platform";
import type { ClientResult } from "@/modules/platform";
import type { LeadId } from "@/modules/shared-types";
import { matching } from "../lib/default-matching";
import { consumeFunnelStepLimit } from "../lib/consume-funnel-step-limit";
import { funnelStepKey } from "../lib/funnel-step-key";
import { parseWizardAnswers } from "../lib/wizard-answers-schema";

/** A request header, or `null` when there is no request scope to read one from — never a throw (see below). */
function headerOrNull(name: string): string | null {
  try {
    return headers().get(name);
  } catch {
    return null;
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_MAX = 32;
/**
 * ADR-146 (2) — the captured contact, validated at the boundary like everything else here (01 §4a). It is the
 * value ADR-145 (2)'s control compares the signup address against, so an arbitrary string must not reach the
 * column: a payload that names an email and does not carry one is refused rather than stored. The **fold** is
 * the row writer's (`to-lead-row.ts`), not this one's — one normaliser, one validator.
 */
const EMAIL = z.string().trim().email();

export type SaveParentLeadPayload = {
  readonly leadId: string;
  readonly answers: unknown;
  readonly source: string | null;
  readonly completed: boolean;
  /** Absent for a wizard-only lead; present when the signup form's drop captured one (S-X-05 / S-X-06). */
  readonly email?: string | null;
};

export async function saveParentLeadAction(
  payload: SaveParentLeadPayload,
): Promise<ClientResult<void>> {
  const answers = parseWizardAnswers(payload.answers);
  // `undefined` and `null` both mean "no address was captured", which is the ordinary case and not a refusal.
  const email =
    payload.email == null
      ? { success: true as const, data: undefined }
      : EMAIL.safeParse(payload.email);
  if (!UUID.test(payload.leadId) || answers === null || !email.success)
    return toActionResult(
      err("VALIDATION", "Those answers could not be saved.", {
        reason: "invalid-input",
      }),
    );
  // `headers()` throws outside a request scope (a unit test driving the action directly), and this action's
  // standing contract is that it answers through `ClientResult` and never throws. A missing scope degrades to the
  // shared no-address bucket — one bucket for everyone, which is the strict answer rather than the lax one.
  const limitKey = await funnelStepKey(
    headerOrNull("x-forwarded-for"),
    headerOrNull("user-agent"),
  );
  if (!(await consumeFunnelStepLimit(limitKey)))
    return toActionResult(
      err("RATE_LIMITED", "Those answers could not be saved.", {
        reason: "rate-limited",
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
    ...(email.data === undefined ? {} : { email: email.data }),
  });
  return toActionResult(saved.ok ? ok(undefined) : saved);
}
