// 05 §3 rule 1 — the provider is chosen by config (`EMAIL_PROVIDER`), never by editing an import.
//
// `resend` is installed now (`08.01`, `11.29`). It still **refuses rather than falls back**: with no key, or
// with no senders table to resolve a `SenderKey` against, the seam stays closed rather than quietly becoming the
// stub and reporting every send as delivered (01 §4a rule 2; ADR-141 refuses `stub-email` in production for the
// same reason from the other direction).
//
// The key and the mailboxes arrive from boot, not from the environment: `comms` reads no env name itself (01
// §3.2 rule 2) and carries no address literal (L4).
import { err, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type {
  CommsErrorDetails,
  EmailProvider,
  EmailProviderOptions,
} from "../types";
import type { EmailProviderId } from "../email/types";
import { createResendEmailProvider } from "../email/resend-email";
import { stubEmailProvider } from "../email/stub-email";

export function emailProviderFor(
  id: EmailProviderId,
  options: EmailProviderOptions = {},
): Result<EmailProvider, CommsErrorDetails> {
  if (id === "stub-email") return ok(stubEmailProvider);
  const { apiKey, senders } = options;
  if (apiKey === undefined || apiKey === "" || senders === undefined)
    return err("INTERNAL", "That email provider is not installed", {
      reason: "comms-not-configured",
      provider: id,
    });
  return ok(createResendEmailProvider(apiKey, senders));
}
