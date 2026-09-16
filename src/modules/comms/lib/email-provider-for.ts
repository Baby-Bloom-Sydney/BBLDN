// 05 §3 rule 1 — the provider is chosen by config (`EMAIL_PROVIDER`), never by editing an import. `resend` is
// Phase 1 and is not installed by this unit, so asking for it fails loudly instead of falling back to the stub
// and looking like a working send (01 §4a rule 2).
import { err, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { CommsErrorDetails, EmailProvider } from "../types";
import type { EmailProviderId } from "../email/types";
import { stubEmailProvider } from "../email/stub-email";

export function emailProviderFor(
  id: EmailProviderId,
): Result<EmailProvider, CommsErrorDetails> {
  if (id === "stub-email") return ok(stubEmailProvider);
  return err("INTERNAL", "That email provider is not installed", {
    reason: "comms-not-configured",
    provider: id,
  });
}
