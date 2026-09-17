// `comms` (03 §8) — the provider is chosen by `EMAIL_PROVIDER` (05 §3 rule 1; 03 §8.4), never by an import edit:
// `stub-email` records and delivers nothing; `resend` is not installed, and `emailProviderFor` refuses it rather
// than falling back to the stub, so a deployment that names it gets a loud boot line and a fail-closed seam —
// not a stub quietly posing as a provider. `SMS_PROVIDER` has one legal value, `null-sms` (N-11, ADR-063).
// The **store** is now real (ADR-131 (1), S5b): `dbCommsStore` over `auth`'s data port, keyed on `dedupe_key`
// and `id` through the port's `eq()` — what P1-WIRE could not honestly build. Since `P1-STORES` it also carries
// **ADR-136's `resolveRecipient`**: `user_profiles` keyed on `user_id`, at service scope, inside the store that
// already writes `email_logs` under it — the one read that lets a caller name a nanny instead of addressing her. The **renderer** is still the one
// port the seam lacks (no template files yet — F-b README gap 3), installed fail-closed with the reason
// `comms/types.ts` reserves for it, so a send fails with the honest cause, not `comms-not-configured`.
import {
  configureComms,
  createComms,
  emailProviderFor,
  nullSmsProvider,
} from "@/modules/comms";
import type { EmailProviderId } from "@/modules/comms";
import { log } from "@/modules/platform";
import type { PortWiring } from "./types";
import { auth } from "@/modules/auth";
import { dbCommsStore } from "./db-comms-store";
import { unconfiguredTemplateRenderer } from "./unconfigured-template-renderer";

const RENDERER_MISSING =
  "the email_logs + inbox_messages store is live over the keyed read (ADR-131 (1)); no template file exists yet (F-b README gap 3), so every send still fails closed with renderer-not-configured";

export function wireComms(emailProvider: EmailProviderId): PortWiring {
  const email = emailProviderFor(emailProvider);
  if (!email.ok) {
    log.error("boot: the configured email provider is not installed", {
      action: "boot",
      module: "comms",
      alert: "ALERT_ENV_INVALID",
      provider: emailProvider,
      reason: email.error.details?.reason,
    });
    return {
      port: "comms",
      binding: "unconfigured",
      reason: `EMAIL_PROVIDER names a provider that is not installed; the seam stays fail-closed (comms-not-configured)`,
    };
  }
  configureComms(
    createComms({
      email: email.value,
      sms: nullSmsProvider,
      store: dbCommsStore(auth.data),
      renderer: unconfiguredTemplateRenderer,
    }),
  );
  return {
    port: "comms",
    binding: `${email.value.id} + ${nullSmsProvider.id}`,
    reason: RENDERER_MISSING,
  };
}
