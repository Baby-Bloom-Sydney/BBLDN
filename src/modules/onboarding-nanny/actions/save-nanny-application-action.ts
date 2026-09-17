"use server";
// S-X-15 page 8 — the application is written (04 §4.1 row 5 "Page 8 writes the lead record `applied`"). Validated
// once (01 §4a); 07 §8 row 2's funnel limit spent before any write; the lead captured by email at service scope
// (02 §4.7: overwritten in place if unconverted; "sign in instead" if the address has an account); the lead id
// carried to N2–N5 in the `HttpOnly` lead cookie (ADR-150), never in a URL; `lead.created` emitted for a new
// row (03 §9.3). Every INTERNAL reason stays server-side (01 §4a): the form gets the generic line.
import { Events, ok, toActionResult } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type {
  NannyApplicationAction,
  NannyApplicationInput,
  NannyApplicationOutcome,
  NannyFunnelErrorDetails,
} from "../types";
import { carriedTokenCookie } from "../lib/carried-token-cookie";
import { consumeFunnelStepLimit } from "../lib/consume-funnel-step-limit";
import { nannyApplicationSchema } from "../lib/nanny-application-schema";
import { nannyLeadStore } from "../lib/default-nanny-lead-store";
import { parseForm } from "../lib/parse-form";
import { refuseFunnel } from "../lib/refuse-funnel";

const FIELDS = [
  "firstName",
  "lastName",
  "email",
  "mobile",
  "district",
  "area",
  "rtwStatus",
  "hasEnhancedDbs",
  "yearsExperience",
  "ageGroups",
] as const;
const ACTION = "saveNannyApplication";

async function capture(
  input: NannyApplicationInput,
): Promise<Result<NannyApplicationOutcome, NannyFunnelErrorDetails>> {
  if (!(await consumeFunnelStepLimit("S-X-15")))
    return refuseFunnel(ACTION, "rate-limited", { reason: "rate-limited" });
  const captured = await nannyLeadStore.capture({ ...input, source: "apply" });
  if (!captured.ok) return refuseFunnel(ACTION, "lead-not-captured", captured.error);
  if (captured.value.state === "has-account") return ok({ next: "sign-in" as const });
  carriedTokenCookie.set("nannyLead", captured.value.leadId);
  if (captured.value.state === "created")
    await Events.emit({
      name: "lead.created",
      actor: { kind: "anonymous" },
      props: { leadId: captured.value.leadId },
    });
  return ok({ next: "interstitial" as const });
}

export const saveNannyApplicationAction: NannyApplicationAction = async (
  _previous: unknown,
  formData: FormData,
) => {
  const parsed = parseForm(nannyApplicationSchema, formData, FIELDS, ["ageGroups"]);
  if (!parsed.ok) return toActionResult(parsed);
  return toActionResult(await capture(parsed.value));
};
