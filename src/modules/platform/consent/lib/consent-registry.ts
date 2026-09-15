// The boot slot for the module-level `consent`. Until `configureConsent` installs a connector over a real (or
// memory) store, every call fails closed — `hasMarketing` included, so no pixel or CAPI send can slip through
// an unconfigured seam (07 §2.9).
import { SECURITY } from "@/modules/config";
import type { Consent, ConsentStore } from "../types";
import { createRegistry } from "../../lib/create-registry";
import { err } from "../../lib/err";
import { createConsent } from "./create-consent";

const NOT_CONFIGURED = err("INTERNAL", "Consent is not configured", {
  reason: "consent-not-configured",
});

const unconfiguredStore: ConsentStore = Object.freeze({
  insertConsent: async () => NOT_CONFIGURED,
  latestConsent: async () => NOT_CONFIGURED,
  insertBiometric: async () => NOT_CONFIGURED,
  insertCookie: async () => NOT_CONFIGURED,
  currentCookie: async () => NOT_CONFIGURED,
  currentDocument: async () => NOT_CONFIGURED,
});

export const CONSENT_REGISTRY = createRegistry<Consent>(
  createConsent({
    store: unconfiguredStore,
    cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
  }),
);
