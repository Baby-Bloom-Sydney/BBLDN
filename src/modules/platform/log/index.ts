// platform/log connector (01 §4b) — `log` is the one helper; `configureLog` is the boot hook (format from the
// environment, tracker from `SENTRY_DSN` — 06 §7.1). `consoleSink` is the only file in the repo that may call
// `console.*` (05 §7 rule 6).
export type * from "./types";
export { ALERT_NAMES } from "./lib/alert-names";
export { scrubPii } from "./lib/scrub-pii";
export { createLogger } from "./lib/create-logger";
export { consoleSink } from "./lib/console-sink";
export { nullErrorTracker } from "./lib/null-error-tracker";
export { sentryErrorTracker } from "./lib/sentry-error-tracker";
export { resolveErrorTracker } from "./lib/resolve-error-tracker";
export { log } from "./lib/default-log";
export { configureLog } from "./lib/configure-log";
