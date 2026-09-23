// `comms` (03 §8) — the provider is chosen by `EMAIL_PROVIDER` (05 §3 rule 1; 03 §8.4), never by an import edit:
// `stub-email` records and delivers nothing (refused in production — ADR-141); `resend` is installed as of 4a
// and is handed its key and the seven mailboxes from here, because `comms` reads no env (01 §3.2 rule 2) and
// carries no address literal (L4). `SMS_PROVIDER` has one legal value, `null-sms` (N-11, ADR-063).
//
// The **store** is `dbCommsStore` over `auth`'s data port (ADR-131 (1), ADR-136). The **renderer** is real now:
// `createTemplateRenderer(EMAIL_TEMPLATES)` over the template files that exist. The registry is partial on
// purpose — 03 §8.2 closes the id union, the files land with the units that fire them — and an id with no file
// answers `INTERNAL { template-schema }` rather than sending a blank body.
//
// **The dry run** (`08.03`) is the `config` flag of the same name, which `config` already forces false outside
// development: boot passes the boolean in, so the guard lives in exactly one place.
import {
  configureComms,
  createComms,
  createTemplateRenderer,
  EMAIL_TEMPLATES,
  emailProviderFor,
  nullSmsProvider,
} from "@/modules/comms";
import type { EmailProviderId } from "@/modules/comms";
import { env, FLAGS, SENDERS } from "@/modules/config/server";
import { log } from "@/modules/platform";
import type { PortWiring } from "./types";
import { auth } from "@/modules/auth";
import { dbCommsStore } from "./db-comms-store";

/** How many of 03 §8.2's ids have a file — stated on the boot line so the gap is read, never assumed closed. */
const TEMPLATES_PRESENT = Object.keys(EMAIL_TEMPLATES).length;

const dryRunNote = (on: boolean): string =>
  on
    ? "; the dev dry run is on, so rows are written dry-run and the provider is never called"
    : "";

export function wireComms(emailProvider: EmailProviderId): PortWiring {
  const email = emailProviderFor(emailProvider, {
    ...(env.server.RESEND_API_KEY === undefined
      ? {}
      : { apiKey: env.server.RESEND_API_KEY }),
    senders: SENDERS,
  });
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
      reason:
        "EMAIL_PROVIDER names a provider that is not installed or carries no key; the seam stays fail-closed (comms-not-configured)",
    };
  }
  configureComms(
    createComms({
      email: email.value,
      sms: nullSmsProvider,
      store: dbCommsStore(auth.data),
      renderer: createTemplateRenderer(EMAIL_TEMPLATES),
      dryRun: FLAGS.EMAIL_DEV_DRY_RUN, // config-literal-ok: reading the flag through FLAGS is what L4 asks for
    }),
  );
  return {
    port: "comms",
    binding: `${email.value.id} + ${nullSmsProvider.id}`,
    reason:
      `${TEMPLATES_PRESENT} template files are installed; every other id in the closed registry answers ` +
      `template-schema until its file lands with the unit that fires it` +
      dryRunNote(FLAGS.EMAIL_DEV_DRY_RUN), // config-literal-ok: reading the flag through FLAGS is what L4 asks for
  };
}
