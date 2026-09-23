// `resend` (03 §8.1; `08.01`, `11.29`) — the one real `EmailProvider`. Selected by `EMAIL_PROVIDER`, never by an
// import edit (05 §3 rule 1); `stub-email` is its counterpart and is refused in production (ADR-141).
//
// **It reads no env and knows no address.** The key and the seven mailboxes are handed in at boot from
// `config/server` — `comms` may not read an env name (01 §3.2 rule 2) and may not carry a mailbox literal, and a
// provider that reached for either would be the exact defect the config layer exists to prevent. The London
// sending domain is therefore not a string in this file: `SENDERS` is built on `DOMAIN`, so when BAI buys the
// domain one config value changes and this file does not.
//
// A `SenderKey` the senders table does not carry answers `sender-unknown` rather than silently falling back to
// `noreply`: sending a verification notice from the wrong mailbox is a support problem, not a rendering detail.
//
// Batch: `sendBatch` uses Resend's own batch endpoint, which is what 03 §8.1 means by "chunked by provider" —
// `comms.sendMany` stays sequential over `send` for its per-row `email_logs` bookkeeping, and this is here for
// the pre-check waves that will use it.
import { Resend } from "resend";
import type { CreateEmailOptions } from "resend";
import type { Sender } from "@/modules/config";
import { err, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type {
  CommsErrorDetails,
  EmailProvider,
  ProviderAck,
  RenderedEmail,
  SenderTable,
} from "../types";

const PROVIDER_ID = "resend";

/** The provider's own request shape — taken from the SDK rather than restated, so a version bump is a typecheck. */
type Payload = CreateEmailOptions;

const rejected = (
  message: string,
  cause?: unknown,
): Result<never, CommsErrorDetails> =>
  err<CommsErrorDetails>(
    "PROVIDER_ERROR",
    message,
    { reason: "provider-rejected", provider: PROVIDER_ID },
    cause,
  );

/** A network failure and a rejection are the same outcome to the caller; the throw rides as `cause` (01 §4a). */
const threw = (thrown: unknown): Result<never, CommsErrorDetails> =>
  rejected("The email provider could not be reached", thrown);

const unknownSender = (): Result<never, CommsErrorDetails> =>
  err<CommsErrorDetails>("NOT_FOUND", "That sender is not configured", {
    reason: "sender-unknown",
    provider: PROVIDER_ID,
  });

/** RFC 5322 display-name form, so the brand name travels with the address rather than being typed per template. */
const addressOf = (sender: Sender): string =>
  `${sender.name} <${sender.address}>`;

const recipientOf = (to: RenderedEmail["to"]): string =>
  to.name === undefined ? to.email : `${to.name} <${to.email}>`;

function payloadFor(
  input: RenderedEmail,
  senders: SenderTable,
): Result<Payload, CommsErrorDetails> {
  const sender = senders[input.from];
  if (sender === undefined) return unknownSender();
  const payload: Payload = {
    from: addressOf(sender),
    to: [recipientOf(input.to)],
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
  };
  return ok(payload);
}

export function createResendEmailProvider(
  apiKey: string,
  senders: SenderTable,
): EmailProvider {
  const client = new Resend(apiKey);
  return Object.freeze({
    id: PROVIDER_ID,
    send: async (input: RenderedEmail) => {
      const payload = payloadFor(input, senders);
      if (!payload.ok) return payload;
      try {
        const answer = await client.emails.send(payload.value);
        if (answer.error !== null) return rejected(answer.error.message);
        if (answer.data === null) return rejected("No message id was returned");
        return ok<ProviderAck>({ providerMessageId: answer.data.id });
      } catch (thrown) {
        return threw(thrown);
      }
    },
    sendBatch: async (inputs: ReadonlyArray<RenderedEmail>) => {
      const payloads: Payload[] = [];
      for (const input of inputs) {
        const payload = payloadFor(input, senders);
        if (!payload.ok) return payload;
        payloads.push(payload.value);
      }
      try {
        const answer = await client.batch.send(payloads);
        if (answer.error !== null) return rejected(answer.error.message);
        if (answer.data === null)
          return rejected("No message ids were returned");
        return ok(
          Object.freeze(
            answer.data.data.map((one) => ({ providerMessageId: one.id })),
          ),
        );
      } catch (thrown) {
        return threw(thrown);
      }
    },
  });
}
