// S-X-05 — one-go signup beside the matches (04 §3.1 step 5). Thin (05 §7 rule 5): `?lead=` from the wizard, else
// back to S-X-03 (04 §6.1 "missing lead"); `?count=` from S-X-04 when `1b` hands it over.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BRAND, SECURITY, URLS } from "@/modules/config";
import {
  AuthShell,
  ParentSignupForm,
  signUpParentAction,
  signupContextFromQuery,
} from "@/modules/onboarding-parent";

export const metadata: Metadata = { title: "Create your account" };

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function MatchmakingSignupPage({ searchParams }: Props) {
  const context = signupContextFromQuery(searchParams);
  if (context.leadId === undefined) redirect("/matchmaking/onboarding");
  const count = Number(searchParams.count);
  return (
    <AuthShell
      brandName={BRAND.name}
      homeHref="/"
      clientTermsHref={URLS.paths.legal.clientTerms}
      privacyHref={URLS.paths.legal.privacy}
    >
      <ParentSignupForm
        action={signUpParentAction}
        variant="beside-matches"
        context={context}
        minPasswordLength={SECURITY.password.minLength}
        signInHref="/login"
        clientTermsHref={URLS.paths.legal.clientTerms}
        privacyHref={URLS.paths.legal.privacy}
        {...(Number.isInteger(count) && count > 0 ? { matchCount: count } : {})}
      />
    </AuthShell>
  );
}
