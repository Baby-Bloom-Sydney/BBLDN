// 01 §4a — the runtime half of "what crosses the boundary". `cause` is dropped by type, but `details` is an open
// record any `err()` call may fill, so nothing stops a future caller putting a thrown `Error` (its `cause`, its
// custom fields), a raw provider body or a credential in it. This walks `details` on *every* code — not just
// INTERNAL — and redacts three ways:
//
//   by key    `KEY_PATTERNS.secret` only — a field named `apiKey` / `token` / `password` / `body` is redacted
//             whatever its value looks like, because most real credentials match no value pattern at all. The
//             `personal` class is deliberately NOT applied: a client `details` legitimately names the field it is
//             about (01 §4c's own example is `details: { mobile: ["UK mobile required"] }`), and that data is the
//             requester's own, going back to the requester.
//   by value  `scrubFreeText` — the same token-wise pass the log message scrubber uses, because a provider's
//             sentence in `details` is prose too: `looksLikePii` alone anchors JWT / provider key / bearer at the
//             start of the string and would miss every one of them embedded mid-sentence. Numbers are checked the
//             same way the log line checks them, so the two boundaries agree.
//   by shape  an `Error`, or any object that is not a plain object or array (a `Date`, `Map`, `Set`, a class
//             instance). `details` carries plain JSON-shaped data; anything else is redacted rather than walked,
//             because `Object.entries` on it silently yields `{}` and that would be a silent loss, not a guard.
//
// The `as D` at the end is the same boundary assertion `buildLine`'s `as LogLine` makes: a redaction cannot
// preserve `D`'s value types by construction (a redacted field becomes a string), and the alternative — widening
// `ClientAppError<D>['details']` — would change the connector's public type surface.
import type { AppErrorDetails } from "@/modules/shared-types";
import { KEY_PATTERNS } from "./key-patterns";
import { isPhoneLikeNumber } from "./phone-like-number";
import { normaliseKey } from "./normalise-key";
import { scrubFreeText } from "./scrub-free-text";
import { REDACTION_MARKS } from "./redaction-marks";

const MAX_DEPTH = 4;

const isSecretKey = (key: string): boolean => {
  const normalised = normaliseKey(key);
  return (
    !KEY_PATTERNS.safe.test(normalised) && KEY_PATTERNS.secret.test(normalised)
  );
};

const isPlainObject = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

function safeValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubFreeText(value);
  if (typeof value === "number" || typeof value === "bigint")
    return isPhoneLikeNumber(value) ? REDACTION_MARKS.redacted : value;
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return REDACTION_MARKS.truncated;
  if (Array.isArray(value))
    return value.map((item) => safeValue(item, depth + 1));
  if (!isPlainObject(value)) return REDACTION_MARKS.redacted;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      isSecretKey(key)
        ? REDACTION_MARKS.redacted
        : safeValue(nested, depth + 1),
    ]),
  );
}

export function safeDetails<D extends AppErrorDetails>(details: D): D {
  return safeValue(details, 0) as D;
}
