// S-X-09, forgot half (04 §6.1). Thin by rule (05 §7 rule 5): the action and the support mailbox are props.
import type { Metadata } from "next";
import { SENDERS } from "@/modules/config/server";
import {
  ForgotPasswordForm,
  requestPasswordResetAction,
} from "@/modules/onboarding-parent";

export const metadata: Metadata = { title: "Set a new password" };

export default function ForgotPasswordPage() {
  return (
    <ForgotPasswordForm
      action={requestPasswordResetAction}
      signInHref="/login"
      supportEmail={SENDERS.support.address}
    />
  );
}
