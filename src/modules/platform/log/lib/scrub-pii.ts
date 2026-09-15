// 01 §4b "never logged: email addresses, names, phone numbers, document contents, tokens, keys, request bodies";
// 07 §9.2 / §11 item 13 (Sentry `beforeSend` strips emails, names, request bodies). Applied to every log line
// before any sink sees it: by key (the field's name says what it is) and by value (the string looks like one).
// Pure: returns a new structure, bounded in depth and string length, never mutates the input.
import { looksLikePii } from "../../lib/looks-like-pii";

const REDACTED = "[redacted]";
const TRUNCATED = "[truncated]";
const MAX_DEPTH = 4;
const MAX_STRING = 2000;

/** camelCase / kebab-case → snake_case so one pattern set covers `userEmail`, `user_email`, `user-email`. */
const normaliseKey = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();

const SENSITIVE_KEY =
  /(^|_)(e_?mail|phone|mobile|token|secret|password|passwd|authorization|cookie|body|document[a-z_]*|address|name|first_name|last_name|full_name|display_name|surname|given_names?|api_key|private_key)($|_)/;
const SAFE_KEY =
  /^(request_id|idempotency_key|event_name|template_id|module|action|bucket_key|sink_id|retention_row|scrubbed_tables)$/;

const isSensitiveKey = (key: string): boolean => {
  const normalised = normaliseKey(key);
  return !SAFE_KEY.test(normalised) && SENSITIVE_KEY.test(normalised);
};

function scrubString(value: string): string {
  if (looksLikePii(value)) return REDACTED;
  return value.length > MAX_STRING
    ? `${value.slice(0, MAX_STRING)}…${TRUNCATED}`
    : value;
}

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return TRUNCATED;
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
      isSensitiveKey(key) ? REDACTED : scrubValue(value, depth),
    ]),
  );
}

export const scrubPii = (
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => scrubRecord(fields, 0);
