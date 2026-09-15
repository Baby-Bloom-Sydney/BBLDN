// Free text — a log message, a provider's sentence in `details` — is prose, not a value: the PII sits *inside*
// it. `looksLikePii` anchors JWT / provider-key / bearer at the start of the string, so applying it to a whole
// sentence misses every one of them embedded mid-text. This applies it where it works: `Bearer <token>` pairs
// first (they span two words), then token by token, then any phone run, which may span
// several tokens where a number is written with spaces.
//
// Redaction is in place — the surrounding words survive, which is what makes a scrubbed log line still readable.
// `replaceAll` on a matched run redacts every identical occurrence of it, not just the one matched: that errs
// towards redacting, which is the right way to err here.
import { looksLikePii } from "./looks-like-pii";
import { phoneLikeRuns } from "./phone-like-runs";
import { REDACTION_MARKS } from "./redaction-marks";

const BEARER_PAIR = /\bbearer\s+\S+/gi;
const TOKEN = /\S+/g;

export function scrubFreeText(value: string): string {
  const withoutBearer = value.replace(BEARER_PAIR, REDACTION_MARKS.redacted);
  const withoutTokens = withoutBearer.replace(TOKEN, (token) =>
    looksLikePii(token) ? REDACTION_MARKS.redacted : token,
  );
  return phoneLikeRuns(withoutTokens).reduce(
    (text, run) => text.replaceAll(run, REDACTION_MARKS.redacted),
    withoutTokens,
  );
}
