// 01 §2.4 `platform/consent` — the connector object callers import; delegates to the registry so the boot
// wiring reaches every importer.
import type { Consent } from "../types";
import { CONSENT_REGISTRY } from "./consent-registry";

export const consent: Consent = Object.freeze({
  recordConsent: (input, opts) =>
    CONSENT_REGISTRY.get().recordConsent(input, opts),
  recordInformedAction: (input, opts) =>
    CONSENT_REGISTRY.get().recordInformedAction(input, opts),
  recordBiometricConsent: (input, opts) =>
    CONSENT_REGISTRY.get().recordBiometricConsent(input, opts),
  recordCookieConsent: (input) =>
    CONSENT_REGISTRY.get().recordCookieConsent(input),
  getPolicy: (purpose) => CONSENT_REGISTRY.get().getPolicy(purpose),
  hasMarketing: (subject) => CONSENT_REGISTRY.get().hasMarketing(subject),
  currentCookieChoice: (subject) =>
    CONSENT_REGISTRY.get().currentCookieChoice(subject),
  dueForRenewal: (userId, purposes) =>
    CONSENT_REGISTRY.get().dueForRenewal(userId, purposes),
  auditExpiry: (now, purposes) =>
    CONSENT_REGISTRY.get().auditExpiry(now, purposes),
  hasConsent: (userId, purpose) =>
    CONSENT_REGISTRY.get().hasConsent(userId, purpose),
});
