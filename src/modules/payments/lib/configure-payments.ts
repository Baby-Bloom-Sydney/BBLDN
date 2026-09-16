// Boot hook: installs the inside the module-level `payments` binding delegates to. Called once from
// `src/instrumentation.ts`, after `configurePurchaseProvider` (the inside calls the provider).
import type { PurchasePath } from "../types";
import { PAYMENTS_REGISTRY } from "./payments-registry";

export function configurePayments(path: PurchasePath): void {
  PAYMENTS_REGISTRY.set(path);
}
