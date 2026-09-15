// 01 §3.1 / 07 §7 rule 6 — the config values that are security controls, one file reviewed as a unit: rate limits
// (07 §8), signed-URL TTLs (07 §5.3 rule 1), upload controls (uploads.ts), retention windows (07 §6.2 — ADR-105 as
// tabled), password policy (07 §4 row 4.10), admin MFA (07 §5.4), CSP origins (07 §10.3). Client-safe.
import { publicEnv } from "./public-env";
import type { RateLimit } from "./types";
import { UPLOADS } from "./uploads";

const rateLimit = (limit: RateLimit): RateLimit => Object.freeze(limit);

export const SECURITY = Object.freeze({
  rateLimits: Object.freeze({
    publicRead: rateLimit({
      key: "ip",
      perMinute: 30,
      perDay: 300,
      note: "quick-match API / browse / profile (row 1)",
    }),
    funnelStep: rateLimit({
      key: "ip+ua",
      perMinute: 10,
      note: "wizard, /apply steps (row 2)",
    }),
    signupPerIp: rateLimit({ key: "ip", perHour: 5, note: "row 2" }),
    signupPerEmail: rateLimit({ key: "email-hash", perDay: 3, note: "row 2" }),
    authPerEmail: rateLimit({
      key: "email-hash+ip",
      perMinute: 5,
      note: "5 / 15 min then 15-min lockout (row 3)",
    }),
    authPerIp: rateLimit({ key: "ip", perHour: 20, note: "row 3" }),
    clientEvents: rateLimit({
      key: "ip+ua",
      perMinute: 60,
      perHour: 600,
      note: "POST /api/events; batch ≤ 20 (row 4)",
    }),
    cookieConsent: rateLimit({ key: "ip", perMinute: 10, note: "row 5" }),
    bookingHolds: rateLimit({
      key: "user",
      perHour: 10,
      note: "≤ 2 concurrent holds; 5 reschedules / day (row 6)",
    }),
    inviteLookup: rateLimit({
      key: "ip",
      perMinute: 10,
      perDay: 60,
      note: "5 failed / h → 1 h block (row 7)",
    }),
    katieChat: rateLimit({
      key: "bot",
      perMinute: 20,
      perDay: 300,
      note: "row 8",
    }),
    katieUploads: rateLimit({ key: "user", perHour: 30, note: "row 8" }),
    agentRoute: rateLimit({
      key: "token",
      perMinute: 60,
      perDay: 200,
      note: "positions created ≤ 200 / day (row 9)",
    }),
    contactForm: rateLimit({
      key: "ip+email-hash",
      perHour: 3,
      perDay: 10,
      note: "row 10",
    }),
    verificationSubmissions: rateLimit({
      key: "user",
      perDay: 5,
      note: "per section (row 11)",
    }),
    nannyApplications: rateLimit({ key: "user", perDay: 10, note: "row 12" }),
    adminRoutes: rateLimit({ key: "admin", perMinute: 600, note: "row 14" }),
  }),
  authLockoutMinutes: 15, // 07 §8 row 3
  inviteLookupBlock: Object.freeze({ failedPerHour: 5, blockMinutes: 60 }), // 07 §8 row 7
  burstAlertMultiple: 10, // ALERT_RATE_LIMIT_BURST when a key trips ≥ 10× in an hour (07 §8)
  signedUrlTtlSeconds: Object.freeze({
    app: 3600,
    browse: 86400,
    verification: 3600,
  }), // 07 §5.3 rule 1
  uploads: UPLOADS,
  password: Object.freeze({
    minLength: 12,
    breachedPasswordCheck: true,
    setPasswordLinkTtlSeconds: 3600,
  }), // 07 §4 row 4.10
  admin: Object.freeze({
    mfaRequired: true,
    requiredAal: "aal2",
    jwtExpirySeconds: 3600,
  }), // 07 §5.4 rows 2, 5
  retention: Object.freeze({
    dormantAccountMonths: 36,
    dormantScrubMonths: 39,
    deactivatedAccountMonths: 12,
    identityObjectDays: 30,
    dbsObjectDays: 30,
    dbsObjectMaxMonths: 6,
    dbsRecordAfterAccountMonths: 12,
    rightToWorkObjectDays: 30,
    rightToWorkRecordAfterAccountMonths: 12,
    rawProviderResponseMonths: 12,
    positionsConnectionsMonths: 24,
    placementsYears: 6,
    bookingNotesMonths: 24,
    childRecordMonthsAfterAccess: 12,
    childRecordReminderMonth: 11,
    orphanedChildDays: 90,
    chatMessagesMonths: 24,
    agentMemoryMonths: 12,
    moneyYears: 6,
    contactMessagesMonths: 24,
    spamMessagesDays: 30,
    consentYearsAfterScrub: 6,
    cookieConsentRecordMonths: 13,
    cookieConsentSupersededDays: 30,
    cookieExpiryDays: 365, // the consent cookie itself — re-prompt after 12 months (07 §6.2 row 12 `config.consent.cookieExpiryDays`)
    emailBodyDays: 90,
    emailMetadataMonths: 24,
    adminNotificationsMonths: 12,
    eventsFullRowMonths: 25,
    eventsDeleteYears: 6,
    nannyLeadsMonths: 12,
    parentLeadsDays: 90,
    backupMaxDays: 35,
    pendingScanObjectHours: UPLOADS.scanPendingMaxHours,
  }),
  csp: Object.freeze({
    supabaseOrigin: new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).origin,
    metaScriptOrigins: Object.freeze(["https://connect.facebook.net"] as const), // nonce-loaded, marketing consent only
    metaConnectOrigins: Object.freeze(["https://www.facebook.com"] as const),
    stripeFormActionOrigins: Object.freeze([
      "https://checkout.stripe.com",
      "https://buy.stripe.com",
    ] as const), // no Stripe origin in script-src (07 §10.3)
    reportPath: "/api/csp-report",
  }),
});
