// The boot slot for the module-level `payments` binding. **Fails closed**: every method answers
// `INTERNAL { reason: 'payments-not-configured' }` until the inside is installed. `getAccess` fails closed too —
// answering "no access" from nowhere would be indistinguishable from a real closed gate and would quietly lock a
// paying family out, while answering "access" would open the product to anyone.
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { PurchasePath } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Payments is not configured", {
  reason: "payments-not-configured" as const,
});

const unconfigured: PurchasePath = Object.freeze({
  createPaymentLink: async () => NOT_CONFIGURED,
  createCheckout: async () => NOT_CONFIGURED,
  handleWebhook: async () => NOT_CONFIGURED,
  getAccess: async () => NOT_CONFIGURED,
  startTrial: async () => NOT_CONFIGURED,
  openDfyAccess: async () => NOT_CONFIGURED,
  setAccess: async () => NOT_CONFIGURED,
  portal: async () => NOT_CONFIGURED,
  prices: () => [],
});

export const PAYMENTS_REGISTRY: Registry<PurchasePath> =
  createRegistry<PurchasePath>(unconfigured);
