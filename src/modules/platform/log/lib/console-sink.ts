// 01 §4b — the stdout sink: JSON lines in production (Vercel captures them), a readable line in development.
// `warn` → stderr via console.warn, `error` → console.error, the rest → console.log. `debug` is dropped in the
// JSON format (dev-only per 01 §4b). This file and `report-sink-failure.ts` are the only console callers.
import type { LogFormat, LogLine, LogSink } from "../types";

const RESERVED = new Set(["ts", "level", "msg"]);

function fieldsOf(line: LogLine): string {
  return Object.entries(line)
    .filter(([key, value]) => !RESERVED.has(key) && value !== undefined)
    .map(
      ([key, value]) =>
        `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`,
    )
    .join(" ");
}

const renderPretty = (line: LogLine): string =>
  `${line.ts} ${line.level.toUpperCase().padEnd(5)} ${line.msg}${fieldsOf(line) ? ` ${fieldsOf(line)}` : ""}`;

const renderJson = (line: LogLine): string => JSON.stringify(line);

export function consoleSink(format: LogFormat): LogSink {
  const render = format === "json" ? renderJson : renderPretty;
  return (line) => {
    if (format === "json" && line.level === "debug") return;
    const text = render(line);
    /* eslint-disable no-console -- the one stdout sink (01 §4b; 05 §7 rule 6) */
    if (line.level === "error") console.error(text);
    else if (line.level === "warn") console.warn(text);
    else console.log(text);
    /* eslint-enable no-console */
  };
}
