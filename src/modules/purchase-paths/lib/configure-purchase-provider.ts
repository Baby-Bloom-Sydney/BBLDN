// Boot hook: installs the provider named by `PURCHASE_PROVIDER` (01 §1.2). Called once from
// `src/instrumentation.ts`; the stub is only ever reachable through the guarded loader (07 §5.5).
import type { PurchaseProvider } from "../types";
import { PURCHASE_PROVIDER_REGISTRY } from "./purchase-provider-registry";

export function configurePurchaseProvider(provider: PurchaseProvider): void {
  PURCHASE_PROVIDER_REGISTRY.set(provider);
}
