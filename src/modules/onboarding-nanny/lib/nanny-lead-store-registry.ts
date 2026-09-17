// The boot slot for the module-level `nannyLeadStore` binding. Fails closed until `configureNannyLeadStore`
// installs the adapter over `nanny_leads` (02 §4.7; service scope — 07 §5.1 rule 5): a default that answered
// `ok` would make an application look captured with no row behind it.
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { NannyLeadStore } from "../types";

const NOT_CONFIGURED = err(
  "INTERNAL",
  "We couldn't save your application just now.",
  { reason: "nanny-store-not-configured" as const },
);

const unconfigured: NannyLeadStore = Object.freeze({
  capture: async () => NOT_CONFIGURED,
  get: async () => NOT_CONFIGURED,
  patch: async () => NOT_CONFIGURED,
});

export const NANNY_LEAD_STORE_REGISTRY: Registry<NannyLeadStore> =
  createRegistry<NannyLeadStore>(unconfigured);
