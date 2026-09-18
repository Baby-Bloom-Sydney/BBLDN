// verification connector (03 §4.3; ADR-026, ADR-071) — nanny verification behind the `vetting-providers`
// connectors. It decides levels and statuses; the providers extract and check. The wizard S-N-03…S-N-10 and its
// inside are L-008 `2b`'s (ADR-153 · ADR-154 · ADR-155); the level rule, the silent hold, the admin decision and
// the sweeps are `2c`'s. The module-level binding fails closed until boot installs the inside.
export type * from "./types";

export { verification } from "./lib/default-verification";
export { configureVerification } from "./lib/configure-verification";
export { unconfiguredVerification } from "./lib/unconfigured-verification";
export { createVerification } from "./lib/create-verification";
export { memoryVerificationStore } from "./lib/memory-verification-store";

// The six actions the route files pass to the screens (01 §2.5 "route files are thin").
export { saveVerificationContactAction } from "./actions/save-verification-contact-action";
export { submitIdentityAction } from "./actions/submit-identity-action";
export { submitDbsAction } from "./actions/submit-dbs-action";
export { submitRightToWorkAction } from "./actions/submit-right-to-work-action";
export { processVerificationAction } from "./actions/process-verification-action";
export { recordBiometricConsentAction } from "./actions/record-biometric-consent-action";

// Server reads the route files call (05 §7 rule 5) and the pure pieces other units may read.
export { loadVerificationStatus } from "./lib/load-verification-status";
export { loadBiometricNotice } from "./lib/load-biometric-notice";
export { wizardOptions } from "./lib/wizard-options";
export { firstIncompleteStep } from "./lib/first-incomplete-step";
export { WIZARD_STEPS } from "./lib/wizard-steps";
export { uploadEvidence } from "./lib/upload-evidence";
export { sniffMime } from "./lib/sniff-mime";
export { evidenceObjectPath } from "./lib/evidence-object-path";
export { contactSchema } from "./lib/contact-schema";
export { identitySchema } from "./lib/identity-schema";
export { dbsSchema } from "./lib/dbs-schema";
export { rightToWorkSchema } from "./lib/right-to-work-schema";

// Screens.
export { VerificationWizard } from "./components/VerificationWizard";
export { VerificationStatusPage } from "./components/VerificationStatusPage";
export { BiometricNoticeConsent } from "./components/BiometricNoticeConsent";
