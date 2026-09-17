"use server";
// S-N-19 — apply-from-portal (`02.07`; 04 §4.2 b4; ADR-147 / ADR-152 (3)). The signed-in nanny's application:
// the same answers as `/apply` minus contact and account (her account holds those), written as a `portal` lead
// (02 §4.7), her profile columns updated from the same answers, the flag lifted by the one writer of it, the
// two events, and on to the verification wizard. Session and role re-checked here (01 §4d defence in depth);
// a second application after the lift is answered without a second lift or a second event.
import { auth } from "@/modules/auth";
import { Events, err, ok, toActionResult } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type {
  ApplyFromPortalAction,
  NannyFunnelErrorDetails,
  NannyProfile,
  NannySignupOutcome,
} from "../types";
import { consumeFunnelStepLimit } from "../lib/consume-funnel-step-limit";
import { nannyAccountStore } from "../lib/default-nanny-account-store";
import { nannyLeadStore } from "../lib/default-nanny-lead-store";
import { nannyPortalSchema } from "../lib/nanny-portal-schema";
import { parseForm } from "../lib/parse-form";
import { refuseFunnel } from "../lib/refuse-funnel";

const FIELDS = [
  "district",
  "area",
  "rtwStatus",
  "hasEnhancedDbs",
  "yearsExperience",
  "ageGroups",
  "roleTypes",
  "availability",
  "rateMin",
  "rateMax",
  "bio",
] as const;
const WIZARD = "/nanny/onboarding-verification";
const ACTION = "applyFromPortal";

type Answers = ReturnType<typeof nannyPortalSchema.parse>;

async function apply(
  me: NannyProfile,
  answers: Answers,
): Promise<Result<NannySignupOutcome, NannyFunnelErrorDetails>> {
  if (!(await consumeFunnelStepLimit("S-N-19")))
    return refuseFunnel(ACTION, "rate-limited", { reason: "rate-limited" });
  const captured = await nannyLeadStore.capture({
    firstName: me.firstName,
    lastName: me.lastName,
    email: me.email,
    mobile: me.mobile ?? ("" as never),
    district: answers.district,
    area: answers.area,
    rtwStatus: answers.rtwStatus,
    hasEnhancedDbs: answers.hasEnhancedDbs,
    yearsExperience: answers.yearsExperience,
    ageGroups: answers.ageGroups,
    source: "portal",
  });
  if (!captured.ok)
    return refuseFunnel(ACTION, "lead-not-captured", captured.error);
  if (captured.value.state !== "has-account") {
    const patched = await nannyLeadStore.patch(captured.value.leadId, {
      roleTypes: answers.roleTypes,
      availability: answers.availability,
      rateBand: answers.rateBand,
      bio: answers.bio,
      funnelStep: "S-N-19",
    });
    if (!patched.ok)
      return refuseFunnel(ACTION, "lead-not-patched", patched.error);
  }
  const profiled = await nannyAccountStore.updateProfile({
    profile: {
      yearsExperience: answers.yearsExperience,
      hourlyRateMinPence: answers.rateBand.minPence,
      availability: answers.availability,
      bio: answers.bio,
    },
    contact: { district: answers.district, area: answers.area },
  });
  if (!profiled.ok)
    return refuseFunnel(ACTION, "profile-not-written", profiled.error);

  const lifted = await nannyAccountStore.liftIsolation();
  if (!lifted.ok)
    return refuseFunnel(ACTION, "isolation-not-lifted", lifted.error);

  const actor = { kind: "user", id: me.userId, role: "nanny" } as const;
  const props = {
    nannyId: me.nannyId,
    path: "apply-from-portal",
    areaDistrict: answers.district,
  } as const;
  await Events.emit({ name: "nanny.applied", actor, props });
  if (lifted.value)
    await Events.emit({ name: "nanny.isolation-lifted", actor, props });
  return ok({ destination: WIZARD });
}

export const applyFromPortalAction: ApplyFromPortalAction = async (
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
  const parsed = parseForm(nannyPortalSchema, formData, FIELDS, [
    "ageGroups",
    "roleTypes",
  ]);
  if (!parsed.ok) return toActionResult(parsed);
  const me = await nannyAccountStore.get();
  if (!me.ok)
    return toActionResult(refuseFunnel(ACTION, "profile-not-read", me.error));
  if (me.value === null)
    return toActionResult(
      refuseFunnel(ACTION, "no-nanny-row", { reason: "no-nanny-row" }),
    );
  return toActionResult(await apply(me.value, parsed.value));
};
