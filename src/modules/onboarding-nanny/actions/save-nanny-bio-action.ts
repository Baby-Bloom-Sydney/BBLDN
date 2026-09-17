"use server";
// S-X-18 — N4's bio patches the lead the cookie names (ADR-150; ADR-148: the bio she wrote, no AI call).
import { ok, toActionResult } from "@/modules/platform";
import type { NannyBioAction } from "../types";
import { consumeFunnelStepLimit } from "../lib/consume-funnel-step-limit";
import { nannyLeadStore } from "../lib/default-nanny-lead-store";
import { nannyBioSchema } from "../lib/nanny-bio-schema";
import { parseForm } from "../lib/parse-form";
import { refuseFunnel } from "../lib/refuse-funnel";
import { readLeadCookie } from "../lib/read-lead-cookie";

const ACTION = "saveNannyBio";

export const saveNannyBioAction: NannyBioAction = async (
  _previous: unknown,
  formData: FormData,
) => {
  const parsed = parseForm(nannyBioSchema, formData, ["bio"]);
  if (!parsed.ok) return toActionResult(parsed);
  const lead = await readLeadCookie();
  if (!lead.ok) return toActionResult(lead);
  if (!(await consumeFunnelStepLimit("S-X-18")))
    return toActionResult(
      refuseFunnel(ACTION, "rate-limited", { reason: "rate-limited" }),
    );
  const patched = await nannyLeadStore.patch(lead.value.id, {
    bio: parsed.value.bio,
    funnelStep: "S-X-18",
  });
  if (!patched.ok)
    return toActionResult(
      refuseFunnel(ACTION, "lead-not-patched", patched.error),
    );
  return toActionResult(ok(undefined));
};
