// 01 §4b — the structured logger: `ts · level · msg · fields`, scrubbed, one sink, `error` lines forwarded to
// the tracker. A logger never throws into business code: a failing sink — and a failing *scrub*, since building
// the line now runs two regex pipelines over caller-supplied text — is reported on stderr and swallowed there.
// Those are the deliberate catches in this module, and none of them is silent.
import type { Instant } from "@/modules/shared-types";
import type {
  ErrorTracker,
  Log,
  LogFields,
  LogLevel,
  LogLine,
  LoggerDeps,
} from "../types";
import { nullErrorTracker } from "./null-error-tracker";
import { scrubMessage } from "./scrub-message";
import { scrubPii } from "./scrub-pii";
import { reportSinkFailure } from "./report-sink-failure";

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
});
const defaultClock = (): Instant => new Date().toISOString() as Instant;

type Resolved = {
  readonly sink: LoggerDeps["sink"];
  readonly tracker: ErrorTracker;
  readonly clock: () => Instant;
  readonly minLevel: LogLevel;
  readonly base: LogFields;
};

function buildLine(
  deps: Resolved,
  level: LogLevel,
  msg: string,
  fields: LogFields | undefined,
): LogLine {
  const scrubbed = scrubPii({ ...deps.base, ...fields });
  return Object.freeze({
    ...scrubbed,
    ts: deps.clock(),
    level,
    // `msg` is scrubbed here, not at the sink: the tracker is handed `line.msg` too (`sentryErrorTracker`).
    msg: scrubMessage(msg),
  }) as LogLine;
}

const UNBUILDABLE = "[log line could not be built]";

/** Scrubbing runs over caller-supplied text; a throw here must not reach the caller, and must not be silent. */
function safeLine(
  deps: Resolved,
  level: LogLevel,
  msg: string,
  fields: LogFields | undefined,
): LogLine {
  try {
    return buildLine(deps, level, msg, fields);
  } catch (thrown) {
    const line = Object.freeze({
      ts: deps.clock(),
      level,
      msg: UNBUILDABLE,
    }) as LogLine;
    reportSinkFailure(line, thrown);
    return line;
  }
}

function write(
  deps: Resolved,
  level: LogLevel,
  msg: string,
  fields?: LogFields,
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[deps.minLevel]) return;
  const line = safeLine(deps, level, msg, fields);
  try {
    deps.sink(line);
  } catch (thrown) {
    reportSinkFailure(line, thrown);
  }
  if (level === "error") {
    try {
      deps.tracker.capture(line);
    } catch (thrown) {
      reportSinkFailure(line, thrown);
    }
  }
}

function build(deps: Resolved): Log {
  return Object.freeze({
    debug: (msg: string, fields?: LogFields) =>
      write(deps, "debug", msg, fields),
    info: (msg: string, fields?: LogFields) => write(deps, "info", msg, fields),
    warn: (msg: string, fields?: LogFields) => write(deps, "warn", msg, fields),
    error: (msg: string, fields?: LogFields) =>
      write(deps, "error", msg, fields),
    child: (fields: LogFields) =>
      build({ ...deps, base: { ...deps.base, ...fields } }),
  });
}

export function createLogger(deps: LoggerDeps): Log {
  return build({
    sink: deps.sink,
    tracker: deps.tracker ?? nullErrorTracker,
    clock: deps.clock ?? defaultClock,
    minLevel: deps.minLevel ?? "debug",
    base: deps.base ?? {},
  });
}
