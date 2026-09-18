// 01 §3.1 / 07 §7 rule 6 — the config values that are security controls, one file reviewed as a unit: rate limits
// (07 §8), signed-URL TTLs (07 §5.3 rule 1), upload controls (uploads.ts), retention windows (07 §6.2 — ADR-105 as
// tabled), password policy (07 §4 row 4.10), admin MFA (07 §5.4), CSP origins (07 §10.3). Client-safe.
import { publicEnv } from "./public-env";
import type { RateLimit } from "./types";
import { UPLOADS } from "./uploads";

// Every policy carries the name it is declared under, stamped here so the two can never drift. Two things read
// that name: `platform/rate-limit` decides ADR-134's fail-open by its membership in `failOpenOnLimiterOutage`
// below, and `check:limiter-call-sites` (ADR-140 / ADR-142) reads the same names out of this file to prove each
// one has a consumer. A policy object built anywhere else carries no name and is therefore never on the list —
// the safe default, because the list is what opens a door.
const declarePolicies = <T extends Record<string, RateLimit>>(
  declared: T,
): Readonly<{ readonly [K in keyof T]: RateLimit }> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(declared).map(([name, limit]) => [
        name,
        Object.freeze({ ...limit, name }),
      ]),
    ),
  ) as Readonly<{ readonly [K in keyof T]: RateLimit }>;

const RATE_LIMITS = declarePolicies({
  publicRead: {
    key: "ip",
    perMinute: 30,
    perDay: 300,
    note: "quick-match API / browse / profile (row 1)",
  },
  funnelStep: {
    key: "ip+ua",
    perMinute: 10,
    note: "wizard, /apply steps (row 2)",
  },
  signupPerIp: { key: "ip", perHour: 5, note: "row 2" },
  signupPerEmail: { key: "email-hash", perDay: 3, note: "row 2" },
  authPerEmail: {
    key: "email-hash+ip",
    perMinute: 5,
    note: "5 / 15 min then 15-min lockout (row 3)",
  },
  authPerIp: { key: "ip", perHour: 20, note: "row 3" },
  clientEvents: {
    key: "ip+ua",
    perMinute: 60,
    perHour: 600,
    note: "POST /api/events; batch ≤ 20 (row 4)",
  },
  cookieConsent: { key: "ip", perMinute: 10, note: "row 5" },
  bookingHolds: {
    key: "user",
    perHour: 10,
    note: "≤ 2 concurrent holds; 5 reschedules / day (row 6)",
  },
  inviteLookup: {
    key: "ip",
    perMinute: 10,
    perDay: 60,
    note: "5 failed / h → 1 h block (row 7)",
  },
  katieChat: {
    key: "bot",
    perMinute: 20,
    perDay: 300,
    note: "row 8",
  },
  katieUploads: { key: "user", perHour: 30, note: "row 8" },
  agentRoute: {
    key: "token",
    perMinute: 60,
    perDay: 200,
    note: "positions created ≤ 200 / day (row 9)",
  },
  contactForm: {
    key: "ip+email-hash",
    perHour: 3,
    perDay: 10,
    note: "row 10",
  },
  verificationSubmissions: {
    key: "user",
    perDay: 5,
    note: "per section (row 11)",
  },
  nannyApplications: { key: "user", perDay: 10, note: "row 12" },
  adminRoutes: { key: "admin", perMinute: 600, note: "row 14" },
  // 07 §8 row 16 (2a's ADR-142 pass): N1's "sign in instead" answer is a deliberate reveal (04 §4.1 row 5), so the
  // lead capture is bounded per **address** as well as per caller — a rotated User-Agent buys nothing against a
  // target list; and S-N-18's authenticated one-write-per-step action carries a per-user ceiling of its own.
  funnelLeadPerEmail: {
    key: "email-hash",
    perDay: 10,
    note: "S-X-15 lead capture per address (row 16)",
  },
  profileSteps: {
    key: "user",
    perMinute: 30,
    perDay: 300,
    note: "S-N-18 profile steps per user (row 16)",
  },
  // 07 §8 row 17 (`2g`'s ADR-142 pass): S-N-01's one submit writes an unclaimed `children` row, an AGR-14
  // consent record and a `nanny_to_parent` invite. The mint is idempotent per child; the **creation is not**,
  // and a `"use server"` export is callable without the form, so the surface is otherwise unbounded. Keyed on
  // the nanny, at the volume a real one has: a handful of existing clients, not hundreds a day.
  childAdds: {
    key: "user",
    perDay: 10,
    note: "S-N-01 add-a-family per nanny (row 17)",
  },
  // 07 §8 has **no row** for a signed-in parent creating a checkout or a portal session, and `1h` needed one:
  // both server actions call out to the purchase provider, so a parent in a tight loop is unbounded provider
  // cost against a real account. Row 13's "no rate limit" is scoped to provider-retried, signature-verified
  // paths (webhooks and crons) and does not reach these. Keyed on the family, because that is who is charged.
  // Owner: 07 §8 — a row 16 to ratify the numbers (`security-reviewer`, `1h` MEDIUM-1).
  purchaseActions: {
    key: "user",
    perMinute: 5,
    perHour: 20,
    note: "checkout + portal session creation (1h; 07 §8 has no row)",
  },
  // 07 §8 has **no row** for S-N-08's poll, and REVIEW-3 M-1 found it unlimited. It cannot take row 11's
  // budget: `processVerification` is what `ProcessingStep` calls every `VETTING.wizard.pollMs` (2 000 ms — 30
  // a minute), so five a day, or any ceiling at or under thirty a minute, would refuse the wizard itself. So
  // this is the nearest-shaped policy written for the surface rather than borrowed from one it would break:
  // keyed on the nanny, at twice the rate an honest screen spends, with a day ceiling that stops a runaway
  // loop long before it stops a real session. Fails closed (not on `failOpenOnLimiterOutage`).
  // Owner: 07 §8 — a row for the poll to ratify the numbers (REVIEW-3 R-3; P2-HARDEN).
  verificationPolls: {
    key: "user",
    perMinute: 60,
    perDay: 600,
    note: "S-N-08 processing poll per nanny (P2-HARDEN; 07 §8 has no row)",
  },
});

/**
 * The declared policy names of 07 §8 — the key each `SECURITY.rateLimits.*` value is declared under. Local, not
 * exported: L1 gives this file one export, and nothing outside it needs the name as a type — callers read
 * `SECURITY.failOpenOnLimiterOutage`, which carries the literals.
 */
type RateLimitPolicyName = keyof typeof RATE_LIMITS;

export const SECURITY = Object.freeze({
  rateLimits: RATE_LIMITS,
  // ADR-134 / ADR-140 — **the fail-open allow-list, and the only one.** When the shared limiter store cannot
  // answer, a policy named here continues and raises `ALERT_PROVIDER_DOWN`; every other policy refuses. It holds
  // `publicRead` alone: the two unauthenticated reads it covers (`/api/areas`, the quick-match read) leak nothing
  // and change nothing, so refusing them would turn one database blip into an outage of the public front door,
  // while an authenticated, mutating, money or admin surface that failed open would hand back exactly the
  // unbounded road its limit exists to close.
  //
  // It stands on that reason alone. It is **not** propped up by an edge fallback: `vercel.json` carries no
  // firewall rule, so on a limiter outage these two reads have nothing else in front of them (B-44 is the rule
  // BAI opens before the first ad). And fail-open is decided **here**, by name — never by a route file claiming
  // the property for itself, which is what ADR-134 forbids and what REVIEW-2 found (M-2).
  failOpenOnLimiterOutage: Object.freeze([
    "publicRead",
  ] as const) satisfies ReadonlyArray<RateLimitPolicyName>,
  authLockoutMinutes: 15, // 07 §8 row 3
  // ADR-150 — a bearer carried between two screens travels in an `HttpOnly` cookie, never a query string: the
  // invite token from S-X-13 to S-X-06 / S-X-07 (REVIEW-2 M-8) and the nanny lead id from S-X-15 to S-X-19
  // (07 §4.6's pattern). Minted by a server action, read by the receiving route + action, cleared by the action
  // that consumes it. Unsigned by ADR-150's argument (neither value is guessable); a signing secret joins here
  // the day a guessable id is carried.
  carriedTokens: Object.freeze({
    invite: Object.freeze({ name: "bb_invite", maxAgeSeconds: 3600 }),
    nannyLead: Object.freeze({ name: "bb_nanny_lead", maxAgeSeconds: 86400 }),
  }),
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
    // 07 §6.1 — **what an erasure keeps, and the reason, in the words the person is owed.** Art 17(3) is what
    // makes keeping these rows lawful and Art 12 is what makes telling her about them mandatory, so the two
    // belong in one list rather than in a screen's copy and a job's comment. `delete-account`'s confirmation and
    // the settings screen both read it; neither exists yet (01 §4e — that cron is still handler-less), and that
    // is exactly why the list is here rather than waiting for them: the sentence 07 §6.1 promises must not be
    // something the first builder of that screen has to remember to write.
    //
    // The third row is the one `0027` made true and the one most likely to be left out, because it applies to
    // nannies only and it is the least comfortable to say. It is said anyway: she is told that a vetting
    // decision about her is kept, that her identity is removed from it, and why.
    erasureRetains: Object.freeze([
      Object.freeze({
        what: "Payment and subscription records",
        why: "UK tax and company law require us to keep them, and they may be needed to settle a dispute.",
        lawfulBasis: "Art 17(3)(b) and (e)",
      }),
      Object.freeze({
        what: "A record of the permissions you gave, and when",
        why: "We have to be able to show what you agreed to and when you agreed to it.",
        lawfulBasis: "Art 17(3)(b)",
      }),
      Object.freeze({
        what: "Safeguarding decisions made about you, with your name and contact details removed",
        why: "Where a background-check decision has been made about someone who cares for children, we are accountable for that decision and have to be able to show who made it and why. Your identity is removed from the record; the decision itself is kept.",
        lawfulBasis: "Art 17(3)(b) and (e)",
      }),
    ] as const),
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
