// The connector object `payments` imports (01 §2.3 row `payments`). Re-reads the registry on every call so boot
// wiring reaches every importer, and so a test can swap the provider between cases (03 §11 row 4).
import type { PurchaseProvider } from "../types";
import { PURCHASE_PROVIDER_REGISTRY } from "./purchase-provider-registry";

// Declared, then frozen — see `payments/lib/default-payments.ts` for why the two steps are separate.
const binding: PurchaseProvider = {
  get name() {
    return PURCHASE_PROVIDER_REGISTRY.get().name;
  },
  ensureCustomer: (family) =>
    PURCHASE_PROVIDER_REGISTRY.get().ensureCustomer(family),
  createPaymentLink: (customer, amount, kind, plan, ref, expiresAt) =>
    PURCHASE_PROVIDER_REGISTRY.get().createPaymentLink(
      customer,
      amount,
      kind,
      plan,
      ref,
      expiresAt,
    ),
  createCheckout: (customer, preset, plan, ref, returnTo) =>
    PURCHASE_PROVIDER_REGISTRY.get().createCheckout(
      customer,
      preset,
      plan,
      ref,
      returnTo,
    ),
  parseEvent: (raw) => PURCHASE_PROVIDER_REGISTRY.get().parseEvent(raw),
  portal: (customer, returnTo) =>
    PURCHASE_PROVIDER_REGISTRY.get().portal(customer, returnTo),
};

export const purchaseProvider: PurchaseProvider = Object.freeze(binding);
