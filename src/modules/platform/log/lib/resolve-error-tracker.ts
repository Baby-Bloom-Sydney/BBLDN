// Boot-time choice (06 §7.1; ADR-106): a DSN *and* an SDK capture function → the Sentry adapter; anything less
// → the null tracker. The DSN is `env.server.SENTRY_DSN`, read by the boot code (never here — platform is
// client-safe and reads no server env).
import type { ErrorCaptureFn, ErrorTracker } from "../types";
import { nullErrorTracker } from "./null-error-tracker";
import { sentryErrorTracker } from "./sentry-error-tracker";

export function resolveErrorTracker(input: {
  readonly dsn: string | undefined;
  readonly capture?: ErrorCaptureFn;
}): ErrorTracker {
  if (
    input.dsn === undefined ||
    input.dsn === "" ||
    input.capture === undefined
  )
    return nullErrorTracker;
  return sentryErrorTracker(input.capture);
}
