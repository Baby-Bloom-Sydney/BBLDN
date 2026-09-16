// S-X-09 (ADR-042) — where 01 §4d step 3 sends a signed-in account that has never set a password. Thin by rule
// (05 §7 rule 5): one connector import, render, no logic.
import type { Metadata } from "next";
import { SECURITY } from "@/modules/config";
import { ROUTE_MAP, SetPasswordForm, setPasswordAction } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Set your password",
  robots: { index: false, follow: false },
};

export default function SetPasswordPage() {
  return (
    <SetPasswordForm
      action={setPasswordAction}
      minLength={SECURITY.password.minLength}
      signInHref={ROUTE_MAP.loginPath}
    />
  );
}
