// `onboarding-nanny`'s two stores (L-008 `2a`): the lead capture over `nanny_leads` at service scope (02 §4.7;
// 07 §5.1 rule 5) and the account side over `0021`'s three definers at session scope (ADR-152). Both are bound
// unconditionally — the schema they read is applied in every environment — so a nanny funnel that reaches a
// deployment with `0021` missing fails at the port with the driver's refusal, not silently.
import { auth } from "@/modules/auth";
import {
  configureNannyAccountStore,
  configureNannyLeadStore,
} from "@/modules/onboarding-nanny";
import { dbNannyAccountStore } from "./db-nanny-account-store";
import { dbNannyLeadStore } from "./db-nanny-lead-store";
import type { PortWiring } from "./types";

export function wireNannyOnboarding(): PortWiring {
  configureNannyLeadStore(dbNannyLeadStore(auth.data));
  configureNannyAccountStore(
    dbNannyAccountStore(auth.data, () => auth.getCurrentUserId()),
  );
  return {
    port: "nanny-onboarding",
    binding:
      "db-nanny-leads (service scope) + db-nanny-account (0021 definers, session scope)",
  };
}
