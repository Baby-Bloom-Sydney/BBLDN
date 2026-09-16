// `platform/consent` (02 R-4) over `auth`'s port: the three append-only tables + `legal_documents` reads
// (`db-consent-store.ts`), the cookie expiry from `SECURITY.retention.cookieExpiryDays` (07 §6.2 row 12) and
// `consent.updated` through the events connector. The cookie half of the store fails closed (see the store).
import { auth } from "@/modules/auth";
import { SECURITY } from "@/modules/config";
import { configureConsent, createConsent, log } from "@/modules/platform";
import { dbConsentStore } from "./db-consent-store";
import { emitConsentUpdated } from "./emit-consent-updated";
import type { PortWiring } from "./types";

const COOKIE_CLOSED =
  "cookie_consent_records fails closed (insertCookie · currentCookie → cookie-consent-not-available): a visitor's current row is a keyed read under the service role, which the Query surface cannot express; hasMarketing therefore refuses (no pixel / CAPI — 07 §2.9's safe side)";

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
      "db-consent (consent_records · biometric_consent_records · legal_documents, session scope)",
    reason: COOKIE_CLOSED,
  };
}
