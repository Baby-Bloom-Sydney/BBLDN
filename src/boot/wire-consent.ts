// `platform/consent` (02 R-4) over `auth`'s port: the three append-only tables + `legal_documents` reads
// (`db-consent-store.ts`), the cookie expiry from `SECURITY.retention.cookieExpiryDays` (07 §6.2 row 12) and
// `consent.updated` through the events connector. The cookie half of the store fails closed (see the store).
import { auth } from "@/modules/auth";
import { SECURITY } from "@/modules/config";
import { configureConsent, createConsent, log } from "@/modules/platform";
import { dbConsentStore } from "./db-consent-store";
import { emitConsentUpdated } from "./emit-consent-updated";
import type { PortWiring } from "./types";

const COOKIE_LIVE =
  "the cookie half is live over the keyed read (ADR-131 (1)): currentCookie reads a visitor's newest un-superseded row through eq(), so hasMarketing answers from the record instead of refusing (07 §2.9)";

export function wireConsent(): PortWiring {
  configureConsent(
    createConsent({
      store: dbConsentStore(auth.data),
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
      onCookieConsent: emitConsentUpdated,
      log,
    }),
  );
  return {
    port: "consent",
    binding:
      "db-consent (consent_records · biometric_consent_records · legal_documents · cookie_consent_records)",
    reason: COOKIE_LIVE,
  };
}
