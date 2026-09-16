// `stub-email` (03 §8.4) — production code inside the module it stubs, selected by `EMAIL_PROVIDER`, never by
// editing an import (05 §3 rule 1). It touches no network: it records the rendered message and acknowledges
// with a `stub-` id, so `email_logs` rows and log lines are identical to Resend's except the provider id.
import type { ProviderAck, RenderedEmail } from "../types";
import type { RecordingEmailProvider } from "./types";

const PROVIDER_ID = "stub-email";

export const stubEmailProvider: RecordingEmailProvider = (() => {
  // Replaced, never mutated (the `createRegistry` discipline of `platform/lib/create-registry.ts`).
  let sent: ReadonlyArray<RenderedEmail> = Object.freeze([]);
  const ackFor = (input: RenderedEmail): ProviderAck => {
    sent = Object.freeze([...sent, input]);
    return { providerMessageId: `${PROVIDER_ID}-${input.messageId}` };
  };
  return Object.freeze({
    id: PROVIDER_ID,
    get sent() {
      return sent;
    },
    reset: () => {
      sent = Object.freeze([]);
    },
    send: async (input: RenderedEmail) => ({
      ok: true as const,
      value: ackFor(input),
    }),
    sendBatch: async (inputs: ReadonlyArray<RenderedEmail>) => ({
      ok: true as const,
      value: Object.freeze(inputs.map(ackFor)),
    }),
  });
})();
