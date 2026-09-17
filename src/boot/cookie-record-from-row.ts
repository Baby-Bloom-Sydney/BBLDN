// One `cookie_consent_records` row → `CookieConsentRecord` (platform/consent; 02 §4.1 row 7). Pure. `ip_address`
// is `inet`, which the generated types spell `unknown` — kept only when it is a string, like the consent row.
import type { AppDatabase } from "@/modules/auth";
import type { CookieConsentRecord } from "@/modules/platform";
import type {
  ConsentRecordId,
  Instant,
  UserId,
  VisitorId,
} from "@/modules/shared-types";

type CookieRow = AppDatabase["Tables"]["cookie_consent_records"]["Row"];

export function cookieRecordFromRow(row: CookieRow): CookieConsentRecord {
  return Object.freeze({
    id: row.id as ConsentRecordId,
    visitorId: row.visitor_id as VisitorId,
    ...(row.user_id === null ? {} : { userId: row.user_id as UserId }),
    choice: row.consent_choice,
    analyticsEnabled: row.analytics_enabled,
    marketingEnabled: row.marketing_enabled,
    context: Object.freeze({
      ...(typeof row.ip_address === "string"
        ? { ipAddress: row.ip_address }
        : {}),
      ...(row.user_agent === null ? {} : { userAgent: row.user_agent }),
    }),
    expiryDate: row.expiry_date as Instant,
    ...(row.superseded_by === null
      ? {}
      : { supersededBy: row.superseded_by as ConsentRecordId }),
    createdAt: row.created_at as Instant,
  });
}
