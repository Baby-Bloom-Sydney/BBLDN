// S-X-07 `/signup/nanny` — the nanny account form, invite path (04 §6.1). Thin by rule (05 §7 rule 5). The
// invite arrives in the `HttpOnly` cookie S-X-13 minted (ADR-150): the route reads only whether it is there —
// the token itself is the action's to read, never a prop, never a hidden field.
import type { Metadata } from "next";
import { SECURITY, URLS } from "@/modules/config";
import {
  NannySignupForm,
  carriedTokenCookie,
  signUpNannyAction,
} from "@/modules/onboarding-nanny";

export const metadata: Metadata = { title: "Create your account" };
export const dynamic = "force-dynamic";

export default function NannySignupPage() {
  return (
    <NannySignupForm
      action={signUpNannyAction}
      hasInvite={carriedTokenCookie.read("invite") !== null}
      minPasswordLength={SECURITY.password.minLength}
      signInHref="/login"
      professionalTermsHref={URLS.paths.legal.professionalTerms}
      privacyHref={URLS.paths.legal.privacy}
    />
  );
}
