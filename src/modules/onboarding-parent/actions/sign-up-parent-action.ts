"use server";
// S-X-05 / S-X-06 — the one server action behind parent signup (01 §4e). Validation once at the boundary (01 §4a);
// then, in the order 02 §4.1 and 04 §3.1 step 6 state: the account (`auth.signUp`, role from a server value),
// the AGR-01 consent rows, the `user_profiles` row, the lead → position conversion when a lead is present (P-2),
// the welcome email (best effort), `signup.completed` (03 §9.3), and the destination (`03.36`). A step that
// refuses returns its refusal as a `ClientResult` — never a thrown error, never a success the database cannot
// show. Every provider text and every INTERNAL reason stays server-side (03 §1 rule 4; 01 §4a): the form gets the
// generic line and its standing "Sign in" link. `auth.signUp` cannot tell a duplicate email from an outage, so
// 04 §6.1's "duplicate email → S-X-08" is pinned as a failing test, not guessed at.
import { URLS } from "@/modules/config";
import { auth } from "@/modules/auth";
import { Events, err, log, ok, toActionResult } from "@/modules/platform";
import type { Result, Url } from "@/modules/shared-types";
import type {
  ParentSignupAction,
  ParentSignupInput,
  ParentSignupOutcome,
  SignupErrorDetails,
} from "../types";
import { parentSignupSchema } from "../lib/parent-signup-schema";
import { parentProfileStore } from "../lib/default-parent-profile-store";
import { recordSignupConsent } from "../lib/record-signup-consent";
import { openPositionFromLead } from "../lib/open-position-from-lead";
import { sendParentWelcome } from "../lib/send-parent-welcome";
import { postSignupDestination } from "../lib/post-signup-destination";

const FIELDS = [
  "firstName",
  "lastName",
  "email",
  "mobile",
  "password",
  "confirmPassword",
  "consent",
  "source",
  "leadId",
  "inviteToken",
  "nannyId",
] as const;

const CALLBACK_PATH = "/api/auth/callback";

const refused = (
  step: "account-not-created" | "consent-not-recorded" | "profile-not-written",
  cause: unknown,
): Result<never, SignupErrorDetails> => {
  log.error("signup refused", {
    module: "onboarding-parent",
    action: "signUpParent",
    step,
    cause,
  });
  return err("INTERNAL", "We couldn't finish creating your account.");
};

function parse(
  formData: FormData,
): Result<ParentSignupInput, SignupErrorDetails> {
  const parsed = parentSignupSchema.safeParse(
    Object.fromEntries(
      FIELDS.map((field) => [field, formData.get(field) ?? undefined]),
    ),
  );
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err<SignupErrorDetails>(
      "VALIDATION",
      first?.message ?? "Please check the details you entered.",
      { reason: "invalid-input", field: String(first?.path[0] ?? "") },
    );
  }
  const {
    confirmPassword: _confirm,
    consent: _consent,
    ...input
  } = parsed.data;
  return ok(input as ParentSignupInput);
}

async function createAccount(
  input: ParentSignupInput,
): Promise<Result<ParentSignupOutcome, SignupErrorDetails>> {
  const signedUp = await auth.signUp({
    email: input.email,
    password: input.password,
    role: "parent",
    emailRedirectTo: `${URLS.app}${CALLBACK_PATH}` as Url,
  });
  if (!signedUp.ok)
    return signedUp.error.code === "VALIDATION"
      ? err<SignupErrorDetails>("VALIDATION", signedUp.error.message, {
          reason: "invalid-input",
          field: "password",
        })
      : refused("account-not-created", signedUp.error);
  const userId = signedUp.value.userId;
  const actor = { kind: "user", id: userId, role: "parent" } as const;

  const consented = await recordSignupConsent(userId);
  if (!consented.ok) return refused("consent-not-recorded", consented.error);

  const profiled = await parentProfileStore.create({
    userId,
    firstName: input.firstName,
    lastName: input.lastName,
    mobile: input.mobile,
  });
  if (!profiled.ok) return refused("profile-not-written", profiled.error);

  const opened =
    input.leadId === undefined
      ? null
      : await openPositionFromLead(input.leadId, actor, input);
  if (opened !== null && !opened.ok)
    log.warn("lead not converted at signup", {
      module: "onboarding-parent",
      action: "signUpParent",
      cause: opened.error,
    });
  const positionOpened = opened !== null && opened.ok;

  await sendParentWelcome({
    userId,
    email: input.email,
    firstName: input.firstName,
    context: input,
    positionOpened,
  });
  await Events.emit({
    name: "signup.completed",
    actor,
    props: { role: "parent", signupSource: input.source },
  });
  return ok(postSignupDestination(input, positionOpened));
}

export const signUpParentAction: ParentSignupAction = async (
  _previous: unknown,
  formData: FormData,
) => {
  const parsed = parse(formData);
  if (!parsed.ok) return toActionResult(parsed);
  return toActionResult(await createAccount(parsed.value));
};
