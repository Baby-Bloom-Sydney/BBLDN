// platform/log — the structured logger's type surface (01 §4b). One `log` helper; JSON lines to stdout in
// production, a readable line in development; every line carries the request id; PII never (07 §9.2).
import type { ErrorCode, Instant, ModuleName, Uuid } from "@/modules/shared-types";

/** `debug` is dev-only (01 §4b); the console sink drops it when the format is `json`. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 01 §4b alert hooks (+ `ALERT_UPLOAD_MALWARE`, 07 §5.3 rule 3 "list to append"). Values: `ALERT_NAMES`. */
export type AlertName = (typeof import("./lib/alert-names").ALERT_NAMES)[number];

/**
 * 01 §4b field list. Anything beyond the named fields is allowed (a provider request id, a count) but is
 * scrubbed by key and by value before it is written — see `scrubPii`.
 */
export type LogFields = {
  readonly requestId?: string;
  readonly module?: ModuleName;
  readonly action?: string;
  /** uuid only — never an email or a name (01 §4b). */
  readonly userId?: Uuid;
  readonly durationMs?: number;
  readonly errorCode?: ErrorCode;
  readonly provider?: string;
  readonly alert?: AlertName;
  readonly [extra: string]: unknown;
};

export type LogLine = LogFields & {
  readonly ts: Instant;
  readonly level: LogLevel;
  readonly msg: string;
};

/** Where a finished (scrubbed) line goes. The console sink is the only file that may call `console.*`. */
export type LogSink = (line: LogLine) => void;

/** 06 §7.1: every `error` line is forwarded with `alert` + `requestId` as tags and no PII. Null when no DSN. */
export type ErrorTracker = {
  readonly id: "null" | "sentry";
  readonly capture: (line: LogLine) => void;
};

export type LogFormat = "pretty" | "json";

export type Log = {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger that carries `fields` (request id, module) on every line it writes. */
  child(fields: LogFields): Log;
};

export type LoggerDeps = {
  readonly sink: LogSink;
  readonly tracker?: ErrorTracker;
  readonly clock?: () => Instant;
  readonly minLevel?: LogLevel;
  readonly base?: LogFields;
};

/** Boot-time wiring for the module-level `log` (the tracker is resolved from `SENTRY_DSN` by the boot code). */
export type LogConfiguration = {
  readonly format?: LogFormat;
  readonly tracker?: ErrorTracker;
  readonly minLevel?: LogLevel;
};

/** The one adapter call a Sentry-backed tracker needs; injected so no SDK type reaches this module. */
export type ErrorCaptureFn = (
  message: string,
  tags: Readonly<Record<string, string>>,
  extra: Readonly<Record<string, unknown>>,
) => void;
