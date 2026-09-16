// The boot slot for the module-level `purchaseProvider` binding. **Fails closed**: until boot installs a real
// provider every call is `INTERNAL { reason: 'provider-not-configured' }` rather than a silent success, because
// the alternative — an unconfigured provider answering "ok" — would let the app behave as though money moved.
import { err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { PurchaseProvider } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Purchase provider is not configured", {
  reason: "provider-not-configured" as const,
});

const unconfigured: PurchaseProvider = Object.freeze({
  name: "stripe-uk",
  ensureCustomer: async () => NOT_CONFIGURED,
  createPaymentLink: async () => NOT_CONFIGURED,
  createCheckout: async () => NOT_CONFIGURED,
  parseEvent: () => NOT_CONFIGURED,
  portal: async () => NOT_CONFIGURED,
});

const slot = { current: unconfigured };

export const PURCHASE_PROVIDER_REGISTRY: Registry<PurchaseProvider> =
  Object.freeze({
    get: () => slot.current,
    set: (next: PurchaseProvider) => {
      slot.current = next;
    },
  });
