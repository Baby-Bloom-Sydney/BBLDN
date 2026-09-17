// S-X-09, reset half (04 §6.1) — where a recovery link's signed-in session sets a new password. The form is `auth`'s
// set-password form (ADR-042), reused not duplicated; the gate's treatment of this path is recorded in the L-007
// `1c` entry. Thin by rule (05 §7 rule 5).
import type { Metadata } from "next";
import { SECURITY } from "@/modules/config";
import { ROUTE_MAP, SetPasswordForm, setPasswordAction } from "@/modules/auth";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <SetPasswordForm
      action={setPasswordAction}
      minLength={SECURITY.password.minLength}
      signInHref={ROUTE_MAP.loginPath}
    />
  );
}
