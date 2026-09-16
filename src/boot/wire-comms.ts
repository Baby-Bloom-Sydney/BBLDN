// `comms` (03 §8) — the provider is chosen by `EMAIL_PROVIDER` (05 §3 rule 1; 03 §8.4), never by an import edit:
// `stub-email` records and delivers nothing; `resend` is not installed, and `emailProviderFor` refuses it rather
// than falling back to the stub, so a deployment that names it gets a loud boot line and a fail-closed seam —
// not a stub quietly posing as a provider. `SMS_PROVIDER` has one legal value, `null-sms` (N-11, ADR-063).
// The store and the renderer are the two ports the seam still lacks; both are installed fail-closed with the
// reason `comms/types.ts` reserves for each, so a send fails with the honest cause, not `comms-not-configured`.
import {
  configureComms,
  createComms,
  emailProviderFor,
  nullSmsProvider,
} from "@/modules/comms";
import type { EmailProviderId } from "@/modules/comms";
import { log } from "@/modules/platform";
import type { PortWiring } from "./types";
import { unconfiguredCommsStore } from "./unconfigured-comms-store";
import { unconfiguredTemplateRenderer } from "./unconfigured-template-renderer";

const PORTS_MISSING =
  "no template file and no email_logs store yet (F-b README gaps 3–4; the Query surface has no keyed read) — every send fails closed with renderer-not-configured";

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
      store: unconfiguredCommsStore,
      renderer: unconfiguredTemplateRenderer,
    }),
  );
  return {
    port: "comms",
    binding: `${email.value.id} + ${nullSmsProvider.id}`,
    reason: PORTS_MISSING,
  };
}
