// The binding the funnel actions write through. Re-reads the registry on every call so boot wiring reaches it.
import type { NannyLeadStore } from "../types";
import { NANNY_LEAD_STORE_REGISTRY } from "./nanny-lead-store-registry";

export const nannyLeadStore: NannyLeadStore = Object.freeze({
  capture: (input) => NANNY_LEAD_STORE_REGISTRY.get().capture(input),
  get: (leadId) => NANNY_LEAD_STORE_REGISTRY.get().get(leadId),
  patch: (leadId, patch) => NANNY_LEAD_STORE_REGISTRY.get().patch(leadId, patch),
});
