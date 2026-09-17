// Boot hook (05 §3 rule 1): the composition root installs the adapter over `0021`'s definers here; a test
// installs the memory double.
import type { NannyAccountStore } from "../types";
import { NANNY_ACCOUNT_STORE_REGISTRY } from "./nanny-account-store-registry";

export function configureNannyAccountStore(store: NannyAccountStore): void {
  NANNY_ACCOUNT_STORE_REGISTRY.set(store);
}
