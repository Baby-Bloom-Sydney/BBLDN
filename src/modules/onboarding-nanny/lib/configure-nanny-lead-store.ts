// Boot hook (05 §3 rule 1): the composition root installs the `nanny_leads` adapter here; a test installs the
// memory double. Nothing inside the module imports a driver.
import type { NannyLeadStore } from "../types";
import { NANNY_LEAD_STORE_REGISTRY } from "./nanny-lead-store-registry";

export function configureNannyLeadStore(store: NannyLeadStore): void {
  NANNY_LEAD_STORE_REGISTRY.set(store);
}
