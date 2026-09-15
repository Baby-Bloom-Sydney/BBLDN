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
] as const);
