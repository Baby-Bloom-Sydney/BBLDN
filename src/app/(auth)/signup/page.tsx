// S-X-06 — cold / invite / profile parent signup (04 §6.1). Thin by rule (05 §7 rule 5): the action and config
// values are props; the entry path is read from the query by the connector. The invite path's token arrives in
// the `HttpOnly` cookie S-X-13 minted (ADR-150) and is merged into the query the connector reads — the URL
// carries nothing, and `onboarding-parent`'s context reader is unchanged.
import type { Metadata } from "next";
import { SECURITY, URLS } from "@/modules/config";
import { carriedTokenCookie } from "@/modules/onboarding-nanny";
import {
  ParentSignupForm,
  signUpParentAction,
  signupContextFromQuery,
} from "@/modules/onboarding-parent";

export const metadata: Metadata = { title: "Create your account" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function SignupPage({ searchParams }: Props) {
  const carried = carriedTokenCookie.read("invite");
  const query =
    carried === null ? searchParams : { ...searchParams, invite: carried };
  return (
    <ParentSignupForm
      action={signUpParentAction}
      variant="cold"
      context={signupContextFromQuery(query)}
      minPasswordLength={SECURITY.password.minLength}
      signInHref="/login"
      clientTermsHref={URLS.paths.legal.clientTerms}
      privacyHref={URLS.paths.legal.privacy}
    />
  );
}
