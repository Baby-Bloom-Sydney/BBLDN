// The last resort when a log sink or tracker throws: one JSON line on stderr naming the failure, so a broken
// sink is visible in Vercel's log stream instead of silently dropping lines. Only `console-sink.ts` and this
// file call `console.*` (05 §7 rule 6).
import type { LogLine } from "../types";
import { scrubPii } from "./scrub-pii";

export function reportSinkFailure(line: LogLine, thrown: unknown): void {
  const failure =
    thrown instanceof Error
      ? { name: thrown.name, message: thrown.message }
      : { value: String(thrown) };
  // eslint-disable-next-line no-console -- the logger's own failure channel (01 §4b: console only inside platform/log)
  console.error(
    JSON.stringify({
      ts: line.ts,
      level: "error",
      msg: "log sink failed",
      requestId: line.requestId,
      droppedMsg: line.msg,
      failure: scrubPii(failure),
    }),
  );
}
