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

/**
 * 07 §6.2 row 12 — how long the cookie choice stands before the banner asks again. Named once because two
 * things read it and they must not drift: the retention window on the record below, and the `Max-Age` of the
 * cookie that carries the visitor id (`visitorCookie`). A visitor whose cookie outlived her record would be
 * counted as having answered a question whose answer we had already dropped.
 */
const COOKIE_EXPIRY_DAYS = 365;

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
  // 07 §8 row 20 (new with L-009 `3f`) — the erasure roads. No existing row fits: this is an authenticated,
  // irreversible, per-person write, and borrowing `profileSteps`' budget would let a hundred attempts a day at
  // the one action nobody should need twice. A person asks to be erased once; five is generous and still bounds
  // a script. The admin road's two steps are covered by `adminRoutes` (row 14) and are not this.
  accountErasure: {
    key: "user",
    perDay: 5,
    note: "row 20 — 07 §6.1's self-service road; fails closed",
  },
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
  // **The visitor id is ours to mint, not the caller's to name** (07 §2.9; L-009 `3e`).
  //
  // The legacy `POST /api/legal/cookie-consent` took `visitor_id` from the request body, so anyone could write
  // a cookie-consent record against any identifier they chose — and, because
  // `cookie_consent_records_current_idx` is UNIQUE on `(visitor_id) where superseded_by is null`, could also
  // collide with a real visitor's current row. The id now travels in an **HttpOnly, signed** cookie the server
  // mints on first contact: a body value is ignored, a tampered cookie is treated as no cookie, and a fresh id
  // is minted rather than an error returned, because the visitor's actual request is to record a choice.
  //
  // `SameSite=Strict`, and the first draft's `Lax` was wrong for a stated reason that did not survive the
  // security pass (LOW, 2026-09-19): the justification given was "the banner must work on a first visit that
  // arrived from a link", but this cookie is never read on the arriving navigation — it does not exist until
  // the page's own same-origin `fetch` POST sets it, and a same-origin request is same-site whatever the
  // referrer. `Strict` is therefore equally functional and closes `Lax`'s top-level-navigation carve-out.
  // `Secure` is set outside development.
  //
  // It is **strictly necessary** in PECR's sense only insofar as it carries a consent record; ADR-175 (a) is
  // explicit that the analytics `visitor_id` is NOT claimed strictly necessary, and this is not that value's
  // home — this cookie exists so a person can *change her mind*, which is the withdrawal right (07 §6).
  visitorCookie: Object.freeze({
    name: "bb_visitor",
    maxAgeSeconds: COOKIE_EXPIRY_DAYS * 24 * 60 * 60,
  }),
  // The **readable** half of the pair (L-009 `3g`; FATE `10.22` / `01.07`). `visitorCookie` above is HttpOnly
  // and signed, which is what makes it safe to decide *which row a write lands on* — and also what makes it
  // useless for the one decision the browser has to make on every page: whether a non-essential script may be
  // mounted at all. ADR-175 (c) puts that decision in JavaScript rather than in the CSP, so the browser needs
  // the answer without a round trip.
  //
  // Three properties keep it honest:
  //   1. **The server writes it, never the client.** It is set on the same response that records the choice, so
  //      it cannot say "accepted" for a choice the database refused. `cookie-utils.ts`'s `setCookiePrefs`,
  //      which wrote it from the browser *before* the record existed, goes with it.
  //   2. **It carries no identifier** — the choice and two flags. The visitor id stays HttpOnly.
  //   3. It is the cookie-preference cookie 07 §2.9 and ADR-175 (a) call strictly necessary: it stores a
  //      person's consent decision and nothing else, so it needs no consent of its own.
  //
  // `SameSite=Lax`, deliberately the opposite of `visitorCookie` and for the opposite reason: this one **is**
  // read on the arriving navigation — that is its whole purpose — so `Strict` would hide a recorded choice
  // from the first page of a visit arriving from a link and ask her again.
  consentPreferenceCookie: Object.freeze({
    name: "bb_consent",
    maxAgeSeconds: COOKIE_EXPIRY_DAYS * 24 * 60 * 60,
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
    cookieExpiryDays: COOKIE_EXPIRY_DAYS, // the consent cookie itself — re-prompt after 12 months (07 §6.2 row 12 `config.consent.cookieExpiryDays`)
    emailBodyDays: 90,
    emailMetadataMonths: 24,
    adminNotificationsMonths: 12,
    eventsFullRowMonths: 25,
    eventsDeleteYears: 6,
    nannyLeadsMonths: 12,
    parentLeadsDays: 90,
    backupMaxDays: 35,
    pendingScanObjectHours: UPLOADS.scanPendingMaxHours,
    // 07 §6.1's "what is retained and why" moved to `LEGAL.erasureRetains` (ADR-179): the *windows* are security
    // configuration and live here; the *list of classes that survive an erasure, and the lawful basis for each*,
    // is a legal fact with one owner (07 §6.2) and one reader set — the job, the confirmation and any future
    // subject-access answer. Keeping it beside the windows put a sentence a person reads next to a number a sweep
    // reads, and made two homes plausible for the next class.
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
