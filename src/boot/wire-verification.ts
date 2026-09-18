// `verification` + `vetting-providers` (L-008 `2b`; ADR-154): the ledger over `0022`'s submit definer, the
// verification store over the view + the other three definers, and the contact writer injected from
// `onboarding-nanny`'s account store (01 §2.3 gives `verification` no arrow to it — the `1i` shape). Bound
// unconditionally — the schema they read is applied in every environment — and the provider is whatever
// `config/vetting.ts` binds: `stub-manual` for every evidence type (03 §4.4; kickoff §4.4), whose only outcome
// is needs-admin, so nothing here can make a nanny look verified (REVIEW-1 M-9 answered by construction).
import { auth } from "@/modules/auth";
import { nannyAccountStore } from "@/modules/onboarding-nanny";
import {
  configureVerification,
  createVerification,
} from "@/modules/verification";
import { configureVettingStore } from "@/modules/vetting-providers";
import { dbVerificationStore } from "./db-verification-store";
import { dbVettingStore } from "./db-vetting-store";
import type { PortWiring } from "./types";

export function wireVerification(): ReadonlyArray<PortWiring> {
  configureVettingStore(dbVettingStore(auth.data));
  configureVerification(
    createVerification({
      store: dbVerificationStore(auth.data),
      contactWriter: (contact) => nannyAccountStore.updateProfile({ contact }),
    }),
  );
  return Object.freeze([
    {
      port: "vetting-providers",
      binding:
        "db-vetting-ledger (0022 submit_verification_evidence at session scope; ledger reads at service scope) — every evidence type bound to stub-manual by config",
    },
    {
      port: "verification",
      binding:
        "db-verification-store (verification_status view + 0022 definers; apply_vetting_check_result at service scope) + contact writer from onboarding-nanny",
    },
  ]);
}
