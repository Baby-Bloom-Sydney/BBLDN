// 01 §4a — the runtime half of "what crosses the boundary". `cause` is dropped by type, but `details` is an open
// record any `err()` call may fill, so nothing stops a future caller putting a thrown `Error` (its `cause`, its
// custom fields) or a raw provider body in it. This walks `details` on *every* code — not just INTERNAL — and
// replaces anything that is an `Error` or reads as PII with the redaction mark.
//
// Deliberately narrower than the log scrubber: it does **not** redact by key, because a client `details` legitimately
// names the field it is about (01 §4c: `details: { mobile: ["UK mobile required"] }`), and it does not touch
// numbers, which are the caller's own data on their way back to that same caller.
import type { AppErrorDetails } from "@/modules/shared-types";
import { looksLikePii } from "./looks-like-pii";
import { REDACTION_MARKS } from "./redaction-marks";

const MAX_DEPTH = 4;

function safeValue(value: unknown, depth: number): unknown {
  if (typeof value === "string")
    return looksLikePii(value) ? REDACTION_MARKS.redacted : value;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) return REDACTION_MARKS.redacted;
  if (depth >= MAX_DEPTH) return REDACTION_MARKS.truncated;
  if (Array.isArray(value))
    return value.map((item) => safeValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      safeValue(nested, depth + 1),
    ]),
  );
}

export function safeDetails<D extends AppErrorDetails>(details: D): D {
  return safeValue(details, 0) as D;
}
