"use server";
// S-N-18 — one step of the ten saved (`03.17`): the step index names which schema parses the form, the two
// halves reach `update_nanny_profile()` under the caller's session (ADR-152 (2)), and the answer is the
// completeness the database computed plus the next step. Session and role re-checked here (01 §4d).
import { auth } from "@/modules/auth";
import { err, ok, toActionResult } from "@/modules/platform";
import type { NannyFunnelErrorDetails, NannyProfileStepAction } from "../types";
import { nannyAccountStore } from "../lib/default-nanny-account-store";
import { nannyProfileStepSchemas } from "../lib/nanny-profile-step-schemas";
import { parseForm } from "../lib/parse-form";
import { PROFILE_STEPS } from "../lib/profile-steps";
import { refuseFunnel } from "../lib/refuse-funnel";

const ACTION = "saveNannyProfileStep";
const LIST_FIELDS = ["ageGroups", "certificates", "languages"] as const;

export const saveNannyProfileStepAction: NannyProfileStepAction = async (
  _previous: unknown,
  formData: FormData,
) => {
  const session = await auth.requireRole("nanny");
  // 01 §4d defence in depth: the refusal keeps `auth`'s code and sentence; its `details` are the gate's, not
  // the form's, and stay server-side.
  if (!session.ok)
    return toActionResult(
      err<NannyFunnelErrorDetails>(session.error.code, session.error.message),
    );
  const index = Number(formData.get("step"));
  const step = Number.isInteger(index) ? PROFILE_STEPS[index] : undefined;
  if (step === undefined)
    return toActionResult(
      err<NannyFunnelErrorDetails>("VALIDATION", "That step doesn't exist.", {
        reason: "invalid-input",
        field: "step",
      }),
    );
  const { schema, toPatch } = nannyProfileStepSchemas[step.id];
  const parsed = parseForm(schema, formData, step.fields, LIST_FIELDS);
  if (!parsed.ok) return toActionResult(parsed);
  const written = await nannyAccountStore.updateProfile(
    toPatch(parsed.value as never),
  );
  if (!written.ok)
    return toActionResult(refuseFunnel(ACTION, step.id, written.error));
  const next = index + 1 < PROFILE_STEPS.length ? index + 1 : null;
  return toActionResult(ok({ complete: written.value.complete, next }));
};
