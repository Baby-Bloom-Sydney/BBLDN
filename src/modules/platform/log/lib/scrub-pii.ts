// 01 §4b "never logged: email addresses, names, phone numbers, document contents, tokens, keys, request bodies";
// 07 §9.2 / §11 item 13 (Sentry `beforeSend` strips emails, names, request bodies) and 07 §2.7(a) / `consent/
// types.ts` (`ip_address` · `user_agent` · `session_id` are stored on the consent row and never logged). Applied
// to every log line before any sink sees it: by key (the field's name says what it is) and by value (the string —
// or the number — looks like one). Pure: returns a new structure, bounded in depth and string length, never
// mutates the input.
import { looksLikePii } from "../../lib/looks-like-pii";
import { REDACTION_MARKS } from "../../lib/redaction-marks";
import { scrubString } from "./scrub-string";

const MAX_DEPTH = 4;

/** camelCase / kebab-case → snake_case so one pattern set covers `userEmail`, `user_email`, `user-email`. */
const normaliseKey = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();

// The trailing `(e?s)?` is load-bearing: without it the `($|_)` boundary broke on every plural (`apiKeys`,
// `tokens`, `emails`, `phones`, `secrets`, `addresses`) and let the field through in the clear.
const SENSITIVE_KEY =
  /(^|_)(e_?mail|phone|mobile|contact_number|token|secret|password|passwd|authorization|cookie|body|document[a-z_]*|address|name|first_name|last_name|full_name|display_name|surname|given_name|api_key|private_key|ip|user_agent|session_id)(e?s)?($|_)/;
const SAFE_KEY =
  /^(request_id|idempotency_key|event_name|template_id|module|action|bucket_key|sink_id|retention_row|scrubbed_tables)$/;

const isSensitiveKey = (key: string): boolean => {
  const normalised = normaliseKey(key);
  return !SAFE_KEY.test(normalised) && SENSITIVE_KEY.test(normalised);
};

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubString(value);
  // A phone number logged as a number is still a phone number (07 §9.2).
  if (typeof value === "number" || typeof value === "bigint")
    return looksLikePii(String(value)) ? REDACTION_MARKS.redacted : value;
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return REDACTION_MARKS.truncated;
  if (value instanceof Error)
    return { name: value.name, message: scrubString(value.message) };
  if (Array.isArray(value))
    return value.map((item) => scrubValue(item, depth + 1));
  return scrubRecord(value as Record<string, unknown>, depth + 1);
}

function scrubRecord(
  record: Readonly<Record<string, unknown>>,
  depth: number,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      isSensitiveKey(key) ? REDACTION_MARKS.redacted : scrubValue(value, depth),
    ]),
  );
}

export const scrubPii = (
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => scrubRecord(fields, 0);
