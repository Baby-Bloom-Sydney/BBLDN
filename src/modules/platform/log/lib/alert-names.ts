// 01 §4b alert hooks — names only; rules, thresholds and channels are 06 §7. `ALERT_UPLOAD_MALWARE` is the
// 07 §5.3 rule 3 append. Add-only; the runbook's alerting matches on these strings.
export const ALERT_NAMES = Object.freeze([
  "ALERT_CRON_FAILED",
  "ALERT_WEBHOOK_FAILED",
  "ALERT_WEBHOOK_SIGNATURE_INVALID",
  "ALERT_PROVIDER_DOWN",
  "ALERT_EMAIL_SEND_FAILED",
  "ALERT_ENV_INVALID",
  "ALERT_CALL_OVERDUE",
  "ALERT_KATIE_DAILY_CAP",
  "ALERT_EVENT_SINK_FAILED",
  "ALERT_BACKUP_FAILED",
  "ALERT_RATE_LIMIT_BURST",
  "ALERT_CSP_VIOLATION",
  "ALERT_DISPLACEMENT_CAP",
  "ALERT_UPLOAD_MALWARE",
  // `audit-consent-expiry` found a day-one legal document with no version at all (01 §4b append, L-009 `3c`).
  // Not a warning: with no row, every consent road that names it fails closed with `document-required`.
  "ALERT_CONSENT_DOCUMENT_MISSING",
  // An object the erasure job could not remove (01 §4b append, L-009 `3f`). The scrub proceeds — leaving a
  // person's record intact for the sake of one orphaned file would be the wrong trade — so this line is the only
  // thing that says a file the person asked us to delete is still in a bucket. The sweep re-collects it.
  "ALERT_ERASURE_OBJECT_STUCK",
] as const);
