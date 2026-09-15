// platform/consent connector (01 §2.4; 02 R-4; 07 §2.6 / §2.7(a) / §2.9) — `consent` is the connector object
// (`recordConsent` · `recordInformedAction` · `recordBiometricConsent` · `recordCookieConsent` · `getPolicy` ·
// `hasMarketing` + `hasConsent`); `configureConsent` is the boot hook over `auth`'s data port. `memoryConsentStore`
// (`consent.stub.ts`) is the stub behind the same port.
export type * from "./types";
export { CONSENT_PURPOSES } from "./lib/consent-purposes";
export { createConsent } from "./lib/create-consent";
export { memoryConsentStore } from "./consent.stub";
export { consent } from "./lib/default-consent";
export { configureConsent } from "./lib/configure-consent";
