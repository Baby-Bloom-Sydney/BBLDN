// `CookieConsentRecord` (platform/consent) → the arguments of `record_cookie_consent` (`0017`). Pure.
//
// The RPC's parameters are positional in SQL but named in PostgREST, so this is the one place the connector's
// camelCase names meet the migration's `p_*` names — the same job `consent-insert-row.ts` does for a table write.
// An absent `userId` / `ipAddress` / `userAgent` is **omitted**, not sent as `null`: those three parameters carry
// `DEFAULT null` in `0017` precisely so the generated `Args` spells them optional, and an omitted key and an
// explicit null write the same column value 02 §4.1 says the row holds.
import type { AppDatabase } from "@/modules/auth";
import type { CookieConsentRecord } from "@/modules/platform";

export type CookieConsentArgs =
  AppDatabase["Functions"]["record_cookie_consent"]["Args"];

export function cookieConsentArgs(
  record: CookieConsentRecord,
): CookieConsentArgs {
  return Object.freeze({
    p_id: record.id,
    p_visitor_id: record.visitorId,
    p_choice: record.choice,
    p_analytics: record.analyticsEnabled,
    p_marketing: record.marketingEnabled,
    p_expiry_date: record.expiryDate,
    p_created_at: record.createdAt,
    ...(record.userId === undefined ? {} : { p_user_id: record.userId }),
    ...(record.context.ipAddress === undefined
      ? {}
      : { p_ip: record.context.ipAddress }),
    ...(record.context.userAgent === undefined
      ? {}
      : { p_user_agent: record.context.userAgent }),
  });
}
