// Boot hook: installs `createConsent({ store, cookieExpiryDays, onCookieConsent, log })` built over `auth`'s
// data port (S4 / S5) — or over `memoryConsentStore()` in test wiring.
import type { Consent } from "../types";
import { CONSENT_REGISTRY } from "./consent-registry";

export function configureConsent(connector: Consent): void {
  CONSENT_REGISTRY.set(connector);
}
