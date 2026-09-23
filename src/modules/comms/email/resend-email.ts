// `resend` (03 §8.1; `08.01`, `11.29`) — the one real `EmailProvider`. Selected by `EMAIL_PROVIDER`, never by an
// import edit (05 §3 rule 1); `stub-email` is its counterpart and is refused in production (ADR-141).
//
// **It reads no env name and knows no address.** The key and the seven mailboxes are handed in at boot from
// `config/server` — `comms` may not read an env name (01 §3.2 rule 2) and may not carry a mailbox literal, and a
// provider that reached for either would be the exact defect the config layer exists to prevent. The London
// sending domain is therefore not a string in this file: `SENDERS` is built on `DOMAIN`, so when BAI buys the
// domain one config value changes and this file does not.
//
// ★ **Why this is `fetch` and not the `resend` SDK.** It was the SDK, and `next build` would not compile: the
// SDK's ESM entry carries `await import("@react-email/render")` — guarded, optional, inside a try/catch, and
// reached only when a caller passes `payload.react`, which this provider never does — but webpack resolves a
// dynamic import statically and the optional peer is not installed. Every unit test passed, because vitest
// never bundles; only running the build found it. Installing a React email renderer we would never call, or
// teaching the bundler to ignore it, would both be working around the shape of the dependency rather than
// removing the need for it. The deeper reason is the module rule: `comms` is a **service leaf** (01 §2.4) that
// every module may import, so an SDK dragging an optional React renderer into its graph is precisely the
// coupling that rule protects. Two JSON POSTs against a documented REST API cost less than either workaround
// and keep the leaf a leaf. (The `resend` dependency stays in `package.json` — the legacy tree still uses it.)
//
// A `SenderKey` the senders table does not carry answers `sender-unknown` rather than silently falling back to
// `noreply`: sending a verification notice from the wrong mailbox is a support problem, not a rendering detail.
//
// Batch: `sendBatch` posts to the batch endpoint, which is what 03 §8.1 means by "chunked by provider" —
// `comms.sendMany` stays sequential over `send` for its per-row `email_logs` bookkeeping, and this is here for
// the pre-check waves that will use it.
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

/** The provider's own endpoint — its identity, not one of our config values (the same class as Stripe's base URL). */
const API = "https://api.resend.com";

/** Resend's wire shape is snake_case; the connector's is camelCase, and this file is the one place they meet. */
type Payload = {
  readonly from: string;
  readonly to: ReadonlyArray<string>;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly reply_to?: string;
};

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
  return ok({
    from: addressOf(sender),
    to: [recipientOf(input.to)],
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo === undefined ? {} : { reply_to: input.replyTo }),
  });
}

/** A rejection body carries `message`; anything else is reported by status, never by guessing at a shape. */
function messageOf(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null) {
    const stated = (body as { readonly message?: unknown }).message;
    if (typeof stated === "string" && stated !== "") return stated;
  }
  return `The email provider answered ${status}`;
}

/** One POST. The caller decides what a 2xx body means; everything else is a `PROVIDER_ERROR`. */
async function post(
  path: string,
  apiKey: string,
  body: unknown,
): Promise<Result<unknown, CommsErrorDetails>> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  // A body that is not JSON is still a rejection to report, never a throw out of this function.
  const parsed: unknown = await response.json().catch(() => null);
  return response.ok
    ? ok(parsed)
    : rejected(messageOf(parsed, response.status));
}

const idOf = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) return null;
  const id = (body as { readonly id?: unknown }).id;
  return typeof id === "string" ? id : null;
};

export function createResendEmailProvider(
  apiKey: string,
  senders: SenderTable,
): EmailProvider {
  return Object.freeze({
    id: PROVIDER_ID,
    send: async (input: RenderedEmail) => {
      const payload = payloadFor(input, senders);
      if (!payload.ok) return payload;
      try {
        const answer = await post("/emails", apiKey, payload.value);
        if (!answer.ok) return answer;
        const id = idOf(answer.value);
        return id === null
          ? rejected("No message id was returned")
          : ok<ProviderAck>({ providerMessageId: id });
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
        const answer = await post("/emails/batch", apiKey, payloads);
        if (!answer.ok) return answer;
        const rows = (answer.value as { readonly data?: unknown })?.data;
        if (!Array.isArray(rows) || rows.length !== payloads.length)
          return rejected("No message ids were returned");
        const acks: ProviderAck[] = [];
        for (const row of rows) {
          const id = idOf(row);
          if (id === null) return rejected("No message ids were returned");
          acks.push({ providerMessageId: id });
        }
        return ok(Object.freeze(acks));
      } catch (thrown) {
        return threw(thrown);
      }
    },
  });
}
