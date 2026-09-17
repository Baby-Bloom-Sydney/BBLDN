"use server";
// S-X-17 — N3's portfolio patches the lead the cookie names (ADR-150). No cookie, a malformed value, or a lead
// the store no longer holds → `no-lead`, and the funnel restarts at N1; nothing is guessed from the form.
import { ok, toActionResult } from "@/modules/platform";
import type { NannyPortfolioAction } from "../types";
import { consumeFunnelStepLimit } from "../lib/consume-funnel-step-limit";
import { nannyLeadStore } from "../lib/default-nanny-lead-store";
import { nannyPortfolioSchema } from "../lib/nanny-portfolio-schema";
import { parseForm } from "../lib/parse-form";
import { refuseFunnel } from "../lib/refuse-funnel";
import { readLeadCookie } from "../lib/read-lead-cookie";

const FIELDS = ["roleTypes", "availability", "rateMin", "rateMax"] as const;
const ACTION = "saveNannyPortfolio";

export const saveNannyPortfolioAction: NannyPortfolioAction = async (
  _previous: unknown,
  formData: FormData,
) => {
  const parsed = parseForm(nannyPortfolioSchema, formData, FIELDS, [
    "roleTypes",
  ]);
  if (!parsed.ok) return toActionResult(parsed);
  const lead = await readLeadCookie();
  if (!lead.ok) return toActionResult(lead);
  if (!(await consumeFunnelStepLimit("S-X-17")))
    return toActionResult(
      refuseFunnel(ACTION, "rate-limited", { reason: "rate-limited" }),
    );
  const patched = await nannyLeadStore.patch(lead.value.id, {
    ...parsed.value,
    funnelStep: "S-X-17",
  });
  if (!patched.ok)
    return toActionResult(
      refuseFunnel(ACTION, "lead-not-patched", patched.error),
    );
  return toActionResult(ok(undefined));
};
