// S-X-06 — cold / invite / profile parent signup (04 §6.1). Thin by rule (05 §7 rule 5): the action and config
// values are props; the entry path is read from the query by the connector.
import type { Metadata } from "next";
import { SECURITY, URLS } from "@/modules/config";
import {
  ParentSignupForm,
  signUpParentAction,
  signupContextFromQuery,
} from "@/modules/onboarding-parent";

export const metadata: Metadata = { title: "Create your account" };

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function SignupPage({ searchParams }: Props) {
  return (
    <ParentSignupForm
      action={signUpParentAction}
      variant="cold"
      context={signupContextFromQuery(searchParams)}
      minPasswordLength={SECURITY.password.minLength}
      signInHref="/login"
      clientTermsHref={URLS.paths.legal.clientTerms}
      privacyHref={URLS.paths.legal.privacy}
    />
  );
}
