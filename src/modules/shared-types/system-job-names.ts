// 03 §2.5 `SystemJobName` — one list with 01 §4f (R11; fix: A-22 / rereview-5). Every cron that calls
// `advance` plus the named sweeps, lapse jobs and in-request system actors. Add-only.
export const SYSTEM_JOB_NAMES = Object.freeze([
  // in-request jobs
  "signup-convert-lead",
  "autofire",
  "call-request",
  "invite-claim",
  "scheduling",
  "cascade",
  "payments-webhook",
  // crons + the sweeps the 5-min run hosts
  "expire-connections",
  "dfy-waves",
  "snapshot-pipeline",
  "send-delayed-emails",
  "expire-slot-holds",
  "admin-call-due",
  "expire-subscribe-invites",
  // the five sweeps 01 §4f adds (R11)
  "meeting-complete-sweep",
  "trial-complete-sweep",
  "placement-start-sweep",
  "close-no-candidates",
  "vetting-expiry",
  // payments lapse jobs + the weekly usage check + the bill-due sweep
  "expire-trials",
  "trial-reminders",
  "expire-past-due",
  "expire-cancelled-subscriptions",
  "usage-weekly-check",
  "payment-due-sweep",
  // security-definer jobs (07 §6.2; R7)
  "retention-sweep",
  "delete-account",
] as const);
