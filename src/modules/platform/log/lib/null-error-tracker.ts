// 06 §7.1 / ADR-106 — the tracker used when `SENTRY_DSN` is absent (every development run; CI): captures nothing.
import type { ErrorTracker } from "../types";

export const nullErrorTracker: ErrorTracker = Object.freeze({
  id: "null" as const,
  capture: () => undefined,
});
