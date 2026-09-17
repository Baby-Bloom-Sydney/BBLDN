"use server";
// S-X-19 / S-X-07 — the one server action behind both nanny signup roads (01 §4e). Validation once (01 §4a);
// 07 §8 row 2's limits ahead of every write; then, in the order 02 §4.1 / §4.2 and 04 §4.1 row 7 state: the
// account (`auth.signUp`, role from a server value), AGR-02, the party rows through `create_nanny_account()`
// (ADR-152 — `is_isolated` **from this action**, ADR-147: `false` from `/apply`, `true` from an invite or a
// bare S-X-07), the welcome (best effort), the events, and the destination. Every INTERNAL reason stays
// server-side and the form gets the one generic line for every failure alike (ADR-132).
//
// **The two roads differ only in where the person comes from** (ADR-150): `/apply` reads the lead the lead
// cookie names — her name, email, mobile and district are the lead's, asked once — and converts it; an invite
// reads the invite cookie, which is the token she arrived with, and clears it.
import { URLS } from "@/modules/config";
import { auth } from "@/modules/auth";
import { Events, err, ok, toActionResult } from "@/modules/platform";
import type { E164, Email, Result, Url, UserId } from "@/modules/shared-types";
import type {
  NannyFunnelErrorDetails,
  NannyLead,
  NannySignupAction,
  NannySignupOutcome,
  NannySignupPath,
} from "../types";
import { carriedTokenCookie } from "../lib/carried-token-cookie";
import { consumeNannySignupLimit } from "../lib/consume-nanny-signup-limit";
import { leadToProfile } from "../lib/lead-to-profile";
import { nannyAccountStore } from "../lib/default-nanny-account-store";
import { nannySignupSchema } from "../lib/nanny-signup-schema";
import { parseForm } from "../lib/parse-form";
import { postNannySignupDestination } from "../lib/post-nanny-signup-destination";
import { readLeadCookie } from "../lib/read-lead-cookie";
import { recordNannySignupConsent } from "../lib/record-nanny-signup-consent";
import { refuseFunnel } from "../lib/refuse-funnel";
import { sendNannyWelcome } from "../lib/send-nanny-welcome";

const FIELDS = ["path", "firstName", "lastName", "email", "password", "confirmPassword", "consent"] as const;
const CALLBACK_PATH = "/api/auth/callback";
const INVITE_TOKEN = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const ACTION = "signUpNanny";

/** Who is signing up, from which road: the lead's person (converted on success) or the form's (invite). */
type Person = {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: Email;
  readonly mobile?: E164;
  readonly district?: string;
  readonly area?: string;
  readonly lead: NannyLead | null;
  readonly inviteToken: string | null;
};

async function personFor(parsed: {
  readonly path: NannySignupPath;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
}): Promise<Result<Person, NannyFunnelErrorDetails>> {
  if (parsed.path === "apply") {
    const lead = await readLeadCookie();
    if (!lead.ok) return lead;
    const { firstName, lastName, email, mobile, district, area } = lead.value;
    return ok({
      firstName,
      lastName,
      email,
      ...(mobile === null ? {} : { mobile }),
      ...(district === null ? {} : { district }),
      ...(area === null ? {} : { area }),
      lead: lead.value,
      inviteToken: null,
    });
  }
  const carried = carriedTokenCookie.read("invite");
  return ok({
    firstName: parsed.firstName ?? "",
    lastName: parsed.lastName ?? "",
    email: parsed.email as Email,
    lead: null,
    inviteToken: carried !== null && INVITE_TOKEN.test(carried) ? carried : null,
  });
}

async function createAccount(
  path: NannySignupPath,
  person: Person,
  password: string,
): Promise<Result<NannySignupOutcome, NannyFunnelErrorDetails>> {
  const surface = path === "apply" ? "S-X-19" : "S-X-07";
  if (!(await consumeNannySignupLimit(person.email, surface)))
    return refuseFunnel(ACTION, "rate-limited", { reason: "rate-limited" });
  const signedUp = await auth.signUp({
    email: person.email,
    password,
    role: "nanny",
    emailRedirectTo: `${URLS.app}${CALLBACK_PATH}` as Url,
  });
  if (!signedUp.ok)
    return signedUp.error.code === "VALIDATION"
      ? err<NannyFunnelErrorDetails>("VALIDATION", signedUp.error.message, {
          reason: "invalid-input",
          field: "password",
        })
      : refuseFunnel(ACTION, "account-not-created", signedUp.error);
  const userId: UserId = signedUp.value.userId;

  const consented = await recordNannySignupConsent(userId);
  if (!consented.ok) return refuseFunnel(ACTION, "consent-not-recorded", consented.error);

  const created = await nannyAccountStore.create({
    firstName: person.firstName,
    lastName: person.lastName,
    // ADR-147: the funnel is the one road that says "not isolated"; every other account starts isolated.
    isolated: path !== "apply",
    ...(person.mobile === undefined ? {} : { mobile: person.mobile }),
    ...(person.district === undefined ? {} : { district: person.district }),
    ...(person.area === undefined ? {} : { area: person.area }),
    ...(person.lead === null ? {} : { leadId: person.lead.id, profile: leadToProfile(person.lead) }),
  });
  if (!created.ok) return refuseFunnel(ACTION, "party-rows-not-written", created.error);

  await sendNannyWelcome({ userId, firstName: person.firstName });
  const actor = { kind: "user", id: userId, role: "nanny" } as const;
  await Events.emit({
    name: "signup.completed",
    actor,
    props: { role: "nanny", signupSource: person.inviteToken === null ? (path === "apply" ? "cold" : "cold") : "invite" },
  });
  if (path === "apply")
    await Events.emit({
      name: "nanny.applied",
      actor,
      props: {
        nannyId: created.value.nannyId,
        path: "apply",
        ...(person.district === undefined ? {} : { areaDistrict: person.district }),
      },
    });
  carriedTokenCookie.clear(path === "apply" ? "nannyLead" : "invite");
  return ok({ destination: postNannySignupDestination({ path, inviteToken: person.inviteToken }) });
}

export const signUpNannyAction: NannySignupAction = async (_previous: unknown, formData: FormData) => {
  const parsed = parseForm(nannySignupSchema, formData, FIELDS);
  if (!parsed.ok) return toActionResult(parsed);
  const person = await personFor(parsed.value);
  if (!person.ok) return toActionResult(person);
  return toActionResult(await createAccount(parsed.value.path, person.value, parsed.value.password));
};
