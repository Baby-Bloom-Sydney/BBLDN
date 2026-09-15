// The value-level half of the log scrubber (01 §4b; 07 §9.2): a string that *looks* like PII is redacted whole,
// and anything longer than a log line should carry (a request body pasted into a field) is truncated. Used for
// every field value and, through `scrubMessage`, for `msg` itself.
import { looksLikePii } from "../../lib/looks-like-pii";
import { REDACTION_MARKS } from "../../lib/redaction-marks";

const MAX_STRING = 2000;

export function scrubString(value: string): string {
  if (looksLikePii(value)) return REDACTION_MARKS.redacted;
  return value.length > MAX_STRING
    ? `${value.slice(0, MAX_STRING)}…${REDACTION_MARKS.truncated}`
    : value;
}
