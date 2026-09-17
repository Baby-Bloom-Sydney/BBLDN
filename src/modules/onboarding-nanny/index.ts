// onboarding-nanny connector (01 §2.3) — the apply funnel (S-X-15…S-X-19), the invite-path account form
// (S-X-07), the ten-step profile completion (S-N-18), the hub's three states (S-N-11 / S-N-22) and
// apply-from-portal (S-N-19; ADR-017, ADR-058, ADR-147). It may import `verification`, `call-layer` and the
// service modules; it never imports `scheduling` (03 §3.6 R3).
export type * from "./types";

// Boot hooks: the two ports (ADR-127) behind registries that fail closed until the composition root installs
// the adapters — `nanny_leads` at service scope (07 §5.1 rule 5) and `0021`'s definers (ADR-152). The bindings
// are exported like every other module-level binding so the boot suite can assert what it bound.
export { configureNannyLeadStore } from "./lib/configure-nanny-lead-store";
export { memoryNannyLeadStore } from "./lib/memory-nanny-lead-store";
export { nannyLeadStore } from "./lib/default-nanny-lead-store";
export { configureNannyAccountStore } from "./lib/configure-nanny-account-store";
export { memoryNannyAccountStore } from "./lib/memory-nanny-account-store";
export { nannyAccountStore } from "./lib/default-nanny-account-store";

// The six actions the route files pass to their forms (01 §2.5 "route files are thin").
export { saveNannyApplicationAction } from "./actions/save-nanny-application-action";
export { saveNannyPortfolioAction } from "./actions/save-nanny-portfolio-action";
export { saveNannyBioAction } from "./actions/save-nanny-bio-action";
export { signUpNannyAction } from "./actions/sign-up-nanny-action";
export { applyFromPortalAction } from "./actions/apply-from-portal-action";
export { saveNannyProfileStepAction } from "./actions/save-nanny-profile-step-action";

// Server reads the route files call (05 §7 rule 5) and the pure pieces other units may read.
export { loadNannyHub } from "./lib/load-nanny-hub";
export { loadNannyProfile } from "./lib/load-nanny-profile";
export { carriedTokenCookie } from "./lib/carried-token-cookie";
export { isNannyProfileComplete } from "./lib/is-nanny-profile-complete";
export { FUNNEL_STEPS } from "./lib/funnel-steps";
export { PROFILE_STEPS } from "./lib/profile-steps";

// Screens.
export { NannyEntryContent } from "./components/NannyEntryContent";
export { NannyApplyFunnel } from "./components/NannyApplyFunnel";
export { NannySignupForm } from "./components/NannySignupForm";
export { NannyHub } from "./components/NannyHub";
export { NannyProfileStepper } from "./components/NannyProfileStepper";
