// `null-sms` (03 §8.4) — the bound SMS provider day one: the slot exists and does nothing. It cannot in fact be
// reached, because `validateMessage` rejects `channel: 'sms'` first; if it ever is, it says so loudly rather
// than pretending a message went out.
import type { SmsProvider } from "../types";

export const nullSmsProvider: SmsProvider = Object.freeze({
  id: "null-sms",
  send: async () => ({
    ok: false as const,
    error: Object.freeze({
      code: "PROVIDER_ERROR" as const,
      message: "SMS is not available",
      details: Object.freeze({
        reason: "sms-not-available" as const,
        provider: "null-sms",
      }),
    }),
  }),
});
