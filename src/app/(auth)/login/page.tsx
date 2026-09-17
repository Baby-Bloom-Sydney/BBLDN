// S-X-08 — sign in + the passwordless catch (04 §6.1). Thin by rule (05 §7 rule 5): the action is a prop; the
// gate's `next=` (01 §4d step 2) is checked by the connector before it is echoed.
import type { Metadata } from "next";
import {
  SignInForm,
  safeNextPath,
  signInAction,
} from "@/modules/onboarding-parent";

export const metadata: Metadata = { title: "Sign in" };

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function LoginPage({ searchParams }: Props) {
  const raw = searchParams.next;
  const nextPath = safeNextPath(typeof raw === "string" ? raw : null);
  return (
    <SignInForm
      action={signInAction}
      {...(nextPath === null ? {} : { nextPath })}
      forgotPasswordHref="/forgot-password"
      signupHref="/signup"
    />
  );
}
