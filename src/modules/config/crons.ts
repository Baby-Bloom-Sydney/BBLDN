// 01 §4f — every cron with its intended Europe/London time; `vercel.json` (UTC only) is generated from this file by
// `npm run crons:generate` and checked by `crons:check` (06 §4.1 C). **Generation rule (re-based by `4b`):** a
// London wall-clock is UTC+0 through GMT and UTC+1 through BST, so a `daily` or `weekly` time renders **both**
// candidate UTC hours (`M H-1,H * * *`) and `runCron`'s due-gate (`api/_lib/cron-is-due.ts`) discards the one that
// is not the declared London time. The job therefore fires twice in UTC and acts once per London day, at the hour
// written here, in both halves of the year. Handlers derive "today" / "yesterday" from `platform.londonWallClock`.
// 01:xx is not declarable (it does not exist on the spring-forward day and happens twice on the fall-back day) and
// neither is 00:xx weekly (its BST candidate lands on the previous weekday) — the renderer throws on both.
// `job` = the 03 §2.5 SystemJobName; crons that move no stage carry none. Parked, never created: release-payouts ·
// schedule-upfront-cycles (N-2, ADR-022).
import type { CronSpec } from "./types";

const every = (minutes: number): CronSpec["london"] =>
  Object.freeze({ kind: "every", minutes });
const daily = (hour: number, minute: number): CronSpec["london"] =>
  Object.freeze({ kind: "daily", hour, minute });
const cron = (spec: CronSpec): CronSpec => Object.freeze(spec);

export const CRONS: ReadonlyArray<CronSpec> = Object.freeze([
  cron({
    path: "/api/cron/send-delayed-emails",
    job: "send-delayed-emails",
    london: every(5),
    serves:
      "delayed sends; hosts the call-due / overdue sweep and expire-slot-holds (03 §3.5)",
  }),
  cron({
    path: "/api/cron/expire-connections",
    job: "expire-connections",
    london: every(15),
    serves: "K-8 / K-10 connection expiry (ADR-018)",
  }),
  cron({
    path: "/api/cron/meeting-complete-sweep",
    job: "meeting-complete-sweep",
    london: every(15),
    serves: "K-12 INTRO_SCHEDULED → INTRO_COMPLETE",
  }),
  cron({
    path: "/api/cron/trial-complete-sweep",
    job: "trial-complete-sweep",
    london: daily(4, 0),
    serves: "K-16 TRIAL_ARRANGED → TRIAL_COMPLETE",
  }),
  cron({
    path: "/api/cron/placement-start-sweep",
    job: "placement-start-sweep",
    london: daily(0, 15),
    serves: "L-1b CONFIRMED → ACTIVE + cascade K-21 (London date)",
  }),
  cron({
    path: "/api/cron/close-no-candidates",
    job: "close-no-candidates",
    london: daily(4, 15),
    serves: "P-7 → CLOSED (no_candidates)",
  }),
  cron({
    path: "/api/cron/vetting-expiry",
    job: "vetting-expiry",
    london: daily(4, 30),
    serves: "DBS / right-to-work / ID expiry → level re-derived (03 §4)",
  }),
  cron({
    path: "/api/cron/expire-subscribe-invites",
    job: "expire-subscribe-invites",
    london: daily(4, 45),
    serves: "subscribe_invites past expires_at → expired (ADR-059)",
  }),
  cron({
    path: "/api/cron/retention-sweep",
    job: "retention-sweep",
    london: daily(2, 0),
    serves:
      "07 §6.2 retention table — daily pass (rows 3–5, 8, 13); the monthly rows run on the 1st inside the same handler",
  }),
  cron({
    path: "/api/cron/delete-account",
    job: "delete-account",
    london: daily(2, 30),
    serves:
      "deletion requests: scrub-and-retain (07 §6.1), emits account.deleted",
  }),
  cron({
    path: "/api/cron/purge-scrubbed-users",
    job: "purge-scrubbed-users",
    london: daily(2, 45),
    serves:
      "07 §6.1 step 6, second half: 30 days after a scrub, hard-delete the auth.users row only if no money / consent / safeguarding row is still inside its window (L-009 3g)",
  }),
  cron({
    path: "/api/cron/proactive",
    london: every(15),
    serves:
      "Katie proactive; the handler gates on waking hours 07:00–22:00 read off `platform.londonWallClock`",
  }),
  cron({
    path: "/api/cron/compact-daily",
    london: daily(3, 0),
    serves: "Katie daily compaction (yesterday in London)",
  }),
  cron({
    path: "/api/cron/cleanup-orphan-children",
    london: daily(3, 0),
    serves: "child-linking hygiene",
  }),
  cron({
    path: "/api/cron/soft-lock-stale-children",
    london: daily(3, 15),
    serves: "child-linking hygiene",
  }),
  cron({
    path: "/api/cron/dfy-waves",
    job: "dfy-waves",
    london: daily(9, 0),
    serves: "pre-check engine sweep (matching.autofire; cadence 01 §10 O-8)",
  }),
  cron({
    path: "/api/cron/snapshot-pipeline",
    job: "snapshot-pipeline",
    london: daily(0, 5),
    serves: "admin pipeline snapshot (snapshot_date = London date)",
  }),
  cron({
    path: "/api/cron/expire-trials",
    job: "expire-trials",
    london: daily(3, 0),
    serves: "trial → lapsed (payments lapse job, R11)",
  }),
  cron({
    path: "/api/cron/trial-reminders",
    job: "trial-reminders",
    london: daily(8, 0),
    serves: "trial-reminder email (T-5 London morning)",
  }),
  cron({
    path: "/api/cron/expire-past-due",
    job: "expire-past-due",
    london: daily(3, 30),
    serves: "past-due grace → lapsed",
  }),
  cron({
    path: "/api/cron/expire-cancelled-subscriptions",
    job: "expire-cancelled-subscriptions",
    london: daily(3, 45),
    serves: "cancelled → lapsed at nextPaymentAt (ADR-068)",
  }),
  cron({
    path: "/api/cron/audit-consent-expiry",
    london: daily(21, 5),
    serves: "consent audit (platform/consent)",
  }),
  cron({
    path: "/api/cron/usage-weekly-check",
    job: "usage-weekly-check",
    london: Object.freeze({ kind: "weekly", weekday: 1, hour: 6, minute: 0 }),
    serves:
      "app usage per family for the results guarantee (ADR-088 G-D; ADR-099); emits usage.weekly-check",
  }),
  cron({
    path: "/api/cron/payment-due-sweep",
    job: "payment-due-sweep",
    london: daily(7, 0),
    serves:
      "DFY families whose nanny started ≥ 7 days ago with no balance link sent (ADR-094); raises payment_due",
  }),
]);
