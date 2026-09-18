// 07 §6.2's retention table, as a value the job reads (ADR-179; L-009 `3h`).
//
// **Why this is not in `legal.ts`.** ADR-179's ruling is about *ownership*, not about a filename: retention facts
// have one owner (07 §6.2) and live in config so the job, the confirmation screen and any future subject-access
// answer read one list. `LEGAL.erasureRetains` is the three-row projection of that table a **person** is shown
// before she confirms an erasure; this is the whole seventeen-row schedule a **timer** acts on. They are the same
// fact seen from two sides, and `check:retention-classes` joins them so the windows can never fork.
//
// **No number is typed here.** Every window is `SECURITY.retention.*`, which is already 07 §6.2's numbers in one
// place. A schedule that restated one would have made two homes for a legal fact, which is the failure ADR-179
// exists to prevent.
//
// **A row that does nothing says so, and says why.** `none` and `deferred` are answers. An absent entry is not:
// `retention-sweep` would quietly skip a class 07 §6.2 promises to act on, and the gate treats that as a failure.
//
// **★ is the line between built and deferred.** 07 §6.2 marks a window with ★ when the number still needs BAI's
// confirmation (§11 item 9). A sweep built on an unconfirmed number would delete real data on a date nobody
// ratified, so every ★ window is `deferred` with BAI named as its owner — a short, precise list for him rather
// than a guess wearing a decimal point. The two classes that matter most today (rows 9 and 11) carry no ★.
//
// **Nothing here pseudonymises.** ADR-170's pseudonym is written by `0027`'s trigger on the way out of an
// erasure, and no row of 07 §6.2 asks a timer to write one — so the treatment does not exist in this type rather
// than existing unused.
import { SECURITY } from "./security";
import type { RetentionClass, RetentionTreatment } from "./types";

/** So `moneyYears * MONTHS_IN_A_YEAR` reads as a sentence (`common/coding-style.md`). */
const MONTHS_IN_A_YEAR = 12;

// Frozen all the way down, because `config.values` asserts it of every config value and a half-frozen schedule
// is a legal fact somebody's code can edit at run time.
const months = (count: number) => Object.freeze({ months: count });
const days = (count: number) => Object.freeze({ days: count });
const anchor = (table: string, column: string) =>
  Object.freeze({ table, column });

const deferredStar = (owner: string, detail: string): RetentionTreatment =>
  Object.freeze({
    kind: "deferred",
    because: `07 §6.2 marks this window ★ — the number needs BAI's confirmation (§11 item 9) before a timer deletes real data on it. ${detail}`,
    owner,
  });

const deferredObject = (detail: string): RetentionTreatment =>
  Object.freeze({
    kind: "deferred",
    because: `the object half needs the storage removal mechanism the erasure job has and the sweep does not; clearing the ref without removing the object destroys the only handle to it, which makes the deletion promise unrecoverable rather than late. ${detail}`,
    owner: "the unit that gives retention-sweep its object half",
  });

export const RETENTION = Object.freeze({
  /**
   * How many rows one class may touch in one run. Bounded so a first run against a full table is a long series of
   * short transactions rather than one that holds locks across the whole schedule; a class that hits the cap says
   * so, and the next run continues.
   */
  batchLimit: 500,

  schedule: Object.freeze([
    // ── row 1 ────────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "dormant-accounts",
      specRow: 1,
      what: "an account with no login for 36 months: reminder, then scrub at 39 months",
      window: null,
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: deferredStar(
        "BAI, then a unit that owns the 36-month reminder",
        "It also needs an email nobody has written: scrubbing at 39 months without the reminder at 36 turns a warned deletion into an unannounced one.",
      ),
    }),
    // ── row 2 ────────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "deactivated-accounts",
      specRow: 2,
      what: "a deactivated account, 12 months later through 07 §6.1",
      window: null,
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: deferredStar(
        "BAI",
        "Its treatment is not a delete but a call into `erase_account()`, which is a different shape from every other row here and wants its own unit.",
      ),
    }),
    // ── row 3 ────────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "identity-objects",
      specRow: 3,
      what: "the identity document and selfie objects, 30 days after the section reaches a terminal state",
      window: days(SECURITY.retention.identityObjectDays),
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: deferredObject(
        "The extracted fields it keeps need no timer — they live and die with the account.",
      ),
    }),
    // ── row 4 ────────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "safeguarding",
      specRow: 4,
      what: "the DBS decision, its decision-maker and its outcome",
      window: null,
      anchors: Object.freeze([]),
      targets: Object.freeze([
        "verifications",
        "vetting_submissions",
        "nanny_suspension_lifts",
      ]),
      treatment: Object.freeze({
        kind: "none",
        because:
          "the clock does not remove a safeguarding decision, and this unit pinned that rather than choosing it: 07 §6.2 row 4 says the record is kept for the life of the account plus ★ 12 months, while ADR-170 says it survives erasure for the same six years as row 11 unless 10-legal sets longer. Those are different answers to the same question, and the disagreement is exactly where this unit was told to record rather than decide. The DBS *object* is row 4's other half and is the `identity-objects` class's problem, not a row's.",
      }),
    }),
    // ── row 5 ────────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "right-to-work-objects",
      specRow: 5,
      what: "the right-to-work document object, 30 days after a terminal status",
      window: days(SECURITY.retention.rightToWorkObjectDays),
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: deferredObject(
        "The structured record is row 5's other half and is kept for the life of the account.",
      ),
    }),
    Object.freeze({
      class: "provider-responses",
      specRow: 5,
      what: "`vetting_submissions.raw_response`, nulled 12 months after `checked_at`",
      window: months(SECURITY.retention.rawProviderResponseMonths),
      anchors: Object.freeze([anchor("vetting_submissions", "checked_at")]),
      targets: Object.freeze(["vetting_submissions"]),
      // The row itself is a safeguarding record and is never removed: this nulls the one column 07 §6.2 names,
      // which is the provider's raw payload and not the decision.
      treatment: Object.freeze({
        kind: "null-columns",
        columns: Object.freeze(["raw_response"]),
      }),
    }),
    // ── row 6 ────────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "positions-connections",
      specRow: 6,
      what: "positions, connections and pre-check rows anonymised 24 months after terminal",
      window: null,
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: deferredStar(
        "BAI, then the unit that owns the anonymised skeleton",
        "Which of `nanny_positions`' free-text columns are the 'requirements text' 07 §6.2 deletes is also a mapping nobody has written down, and guessing it would either keep S3 free text or destroy the skeleton the funnel counts.",
      ),
    }),
    Object.freeze({
      class: "placements",
      specRow: 6,
      what: "the hire record, deleted 6 years after ENDED (Limitation Act 1980 s 5)",
      window: months(SECURITY.retention.placementsYears * MONTHS_IN_A_YEAR),
      anchors: Object.freeze([anchor("nanny_placements", "ended_at")]),
      targets: Object.freeze(["nanny_placements"]),
      treatment: Object.freeze({ kind: "delete" }),
    }),
    // ── row 7 ────────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "booking-notes",
      specRow: 7,
      what: "`bookings.call_note` and `notes`, nulled 24 months after a terminal status",
      window: null,
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: deferredStar(
        "BAI",
        "The columns and the anchor are unambiguous; only the number is ★.",
      ),
    }),
    // ── row 8 ────────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "child-records",
      specRow: 8,
      what: "children, development records, images, Katie rows and chat attachments",
      window: null,
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: deferredStar(
        "BAI, then the units that own `cleanup-orphan-children` and `compact-daily`",
        "Most of this row is already somebody's job — the orphan sweep and the daily compaction — and moving those into this one would take two working jobs apart to no end.",
      ),
    }),
    // ── row 9 ────────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "money",
      specRow: 9,
      what: "the subscription spine, payment events, refunds and guarantees, 6 years after the last transaction",
      window: months(SECURITY.retention.moneyYears * MONTHS_IN_A_YEAR),
      // Per **subject**, not per row: 07 §6.2 says "6 years after the last transaction", so one recent payment
      // holds the whole set. The anchors are every column that counts as a transaction.
      anchors: Object.freeze([
        anchor("parent_subscriptions", "created_at"),
        anchor("payment_events", "received_at"),
        anchor("refund_requests", "created_at"),
        anchor("guarantee_events", "created_at"),
      ]),
      targets: Object.freeze([
        "guarantee_events",
        "refund_requests",
        "payment_events",
        "parent_subscriptions",
      ]),
      treatment: Object.freeze({ kind: "delete" }),
    }),
    // ── row 10 ───────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "contact-messages",
      specRow: 10,
      what: "`contact_messages` 24 months after closed; spam rows at 30 days",
      window: null,
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: deferredStar(
        "BAI",
        "Both halves of the row are ★, so neither is built; the spam half is 30 days and the ordinary half 24 months.",
      ),
    }),
    // ── row 11 ───────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "consent",
      specRow: 11,
      what: "the Art 7(1) consent trail, 6 years after the account scrub",
      window: months(
        SECURITY.retention.consentYearsAfterScrub * MONTHS_IN_A_YEAR,
      ),
      // The anchor is the **scrub**, in 07 §6.2's own words — so a living account's consent trail is never
      // touched, whatever its age. The ledger is where a scrub's date is recorded.
      anchors: Object.freeze([
        anchor("account_erasure_requests", "completed_at"),
      ]),
      targets: Object.freeze(["consent_records", "biometric_consent_records"]),
      treatment: Object.freeze({ kind: "delete" }),
    }),
    // ── row 12 ───────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "cookie-consent-superseded",
      specRow: 12,
      what: "a cookie choice a later choice replaced, 30 days on",
      window: days(SECURITY.retention.cookieConsentSupersededDays),
      anchors: Object.freeze([anchor("cookie_consent_records", "created_at")]),
      targets: Object.freeze(["cookie_consent_records"]),
      treatment: Object.freeze({ kind: "delete" }),
    }),
    Object.freeze({
      class: "cookie-consent",
      specRow: 12,
      what: "a cookie consent record, 13 months from `created_at` (ICO cookie guidance)",
      window: months(SECURITY.retention.cookieConsentRecordMonths),
      anchors: Object.freeze([anchor("cookie_consent_records", "created_at")]),
      targets: Object.freeze(["cookie_consent_records"]),
      treatment: Object.freeze({ kind: "delete" }),
    }),
    // ── row 13 ───────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "email-bodies",
      specRow: 13,
      what: "`email_logs` subject and bodies, nulled 90 days after the send resolved",
      window: days(SECURITY.retention.emailBodyDays),
      anchors: Object.freeze([
        anchor("email_logs", "sent_at"),
        anchor("email_logs", "failed_at"),
      ]),
      targets: Object.freeze(["email_logs"]),
      treatment: Object.freeze({
        kind: "null-columns",
        columns: Object.freeze(["subject", "body_html", "body_text"]),
      }),
    }),
    Object.freeze({
      class: "email-metadata",
      specRow: 13,
      what: "the `email_logs` row itself, 24 months after the send resolved",
      window: months(SECURITY.retention.emailMetadataMonths),
      anchors: Object.freeze([
        anchor("email_logs", "sent_at"),
        anchor("email_logs", "failed_at"),
      ]),
      targets: Object.freeze(["email_logs"]),
      treatment: Object.freeze({ kind: "delete" }),
    }),
    Object.freeze({
      class: "admin-notifications",
      specRow: 13,
      what: "an admin notification, 12 months after it was acknowledged",
      window: months(SECURITY.retention.adminNotificationsMonths),
      anchors: Object.freeze([
        anchor("admin_notifications", "acknowledged_at"),
      ]),
      targets: Object.freeze(["admin_notifications"]),
      treatment: Object.freeze({ kind: "delete" }),
    }),
    // ── row 14 ───────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "events-identifiers",
      specRow: 14,
      what: "`events.visitor_id`, `attribution` and `request_id`, nulled at 25 months",
      window: months(SECURITY.retention.eventsFullRowMonths),
      anchors: Object.freeze([anchor("events", "ts")]),
      targets: Object.freeze(["events"]),
      treatment: Object.freeze({
        kind: "null-columns",
        columns: Object.freeze(["visitor_id", "attribution", "request_id"]),
      }),
    }),
    Object.freeze({
      class: "events",
      specRow: 14,
      what: "the `events` row itself, deleted after 6 years",
      window: null,
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: deferredStar(
        "BAI",
        "The 25-month half of row 14 is built and carries no ★; only the delete does.",
      ),
    }),
    // ── row 15 ───────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "leads",
      specRow: 15,
      what: "unconverted nanny leads at 12 months, unconverted parent leads anonymised at 90 days",
      window: null,
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: deferredStar(
        "BAI",
        "Both halves are ★, and the nanny half also promises an email hash to block re-import which has no table to live in — deleting without it would drop a control 07 §6.2 names.",
      ),
    }),
    // ── row 16 ───────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "deletion-evidence",
      specRow: 16,
      what: "`file_retention_log` — one row per object deleted",
      window: null,
      anchors: Object.freeze([]),
      targets: Object.freeze(["file_retention_log"]),
      treatment: Object.freeze({
        kind: "none",
        because:
          "07 §6.2 row 16 says permanent, and it is the evidence that a deletion happened (Art 5(2)) — a retention sweep that aged out the proof of its own work would be the one deletion nobody could ever show.",
      }),
    }),
    // ── row 17 ───────────────────────────────────────────────────────────────────────────────────────────
    Object.freeze({
      class: "backups",
      specRow: 17,
      what: "Supabase PITR and daily backups, ≤ 35 days",
      window: days(SECURITY.retention.backupMaxDays),
      anchors: Object.freeze([]),
      targets: Object.freeze([]),
      treatment: Object.freeze({
        kind: "none",
        because:
          "a backup is not a row and no database job can reach one: 07 §6.2 row 17 points at `06-runbook.md`'s RPO, and the window is here so the sweep's list is the whole table rather than the part of it a job happens to own.",
      }),
    }),
  ] as ReadonlyArray<RetentionClass>),
});
