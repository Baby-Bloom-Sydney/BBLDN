// 06 §7.1 — the Sentry-shaped adapter: every `error` line forwarded with `alert` + `requestId` (+ module,
// errorCode) as tags and the remaining, already-scrubbed fields as extra. The SDK call itself is injected
// (`ErrorCaptureFn`) so no `@sentry/*` type or import lives in this module; the boot code passes
// `Sentry.captureMessage`-shaped glue once the package is wired (HANDOFF §2 row 10 — Sentry project pending).
import type { ErrorCaptureFn, ErrorTracker, LogLine } from "../types";

const TAG_FIELDS = ["alert", "requestId", "module", "errorCode"] as const;
const OMITTED = new Set<string>(["msg", ...TAG_FIELDS]);

function tagsOf(line: LogLine): Readonly<Record<string, string>> {
  return Object.fromEntries(
    TAG_FIELDS.flatMap((key) => {
      const value = line[key];
      return typeof value === "string" ? [[key, value]] : [];
    }),
  );
}

const extraOf = (line: LogLine): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(line).filter(([key]) => !OMITTED.has(key)));

export function sentryErrorTracker(capture: ErrorCaptureFn): ErrorTracker {
  return Object.freeze({
    id: "sentry" as const,
    capture: (line: LogLine) => capture(line.msg, tagsOf(line), extraOf(line)),
  });
}
