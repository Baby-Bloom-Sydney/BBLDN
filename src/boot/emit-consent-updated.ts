// `platform/consent`'s `onCookieConsent` seam (03 §9.3 Platform group): a recorded cookie choice emits
// `consent.updated` through the events connector. The actor is the visitor — the record always carries a
// `visitorId`, and a `user` actor would need a role the record does not hold. The connector logs a failed emit
// as `warn` and keeps the record (the consent stands whether or not the event was written).
import { Events } from "@/modules/platform";
import type { CookieConsentRecord } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";

export const emitConsentUpdated = (
  record: CookieConsentRecord,
): Promise<Result<unknown>> =>
  Events.emit({
    name: "consent.updated",
    actor: { kind: "visitor", id: record.visitorId },
    props: {
      marketing: record.marketingEnabled,
      necessary: true,
      analytics: record.analyticsEnabled,
    },
  });
