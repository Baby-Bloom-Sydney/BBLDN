// Free text — a log message, a provider's sentence in `details` — is prose, not a value: the PII sits *inside*
// it. `looksLikePii` anchors JWT / provider-key / bearer at the start of the string, so applying it to a whole
// sentence misses every one of them embedded mid-text. This applies it where it works: `Bearer <token>` pairs
// first (they span two words), then token by token, then any phone run (which may span several tokens where a
// number is written with spaces).
//
// Redaction is in place — the surrounding words survive, which is what makes a scrubbed log line still readable.
// `replaceAll` on a matched run redacts every identical occurrence of it, not just the one matched: that errs
// towards redacting, which is the right way to err here.
//
// **Bounded first, scrubbed second.** The regexes here run over caller-supplied text of any length, and matching
// an unanchored pattern against a long string is superlinear — a raw provider body logged in one call could hold
// the event loop for seconds, turning the scrubber into a denial-of-service lever. So the input is cut to
// `MAX_SCANNED` *before* any pattern touches it. (`events/lib/pii-safe-string.ts` gets this for free: zod's
// `.max(256)` runs before its `.refine`.)
//
// One consequence of the phone rule to know: a digit run of 9–15 inside prose — an epoch stamp, a date written
// `2026-09-15 08`, the numeric tail of a hex-lettered uuid — reads as a phone number and is redacted in place.
// That is the fail-closed side of the trade, and the reason `ts`, `userId` and `requestId` are *fields*, not
// words in a message (01 §4b). Pinned by a test so it stays a decision, not an accident.
import { looksLikePii } from "./looks-like-pii";
import { phoneLikeRuns } from "./phone-like-runs";
import { REDACTION_MARKS } from "./redaction-marks";

const BEARER_PAIR = /\bbearer\s+\S+/gi;
const TOKEN = /\S+/g;
const MAX_SCANNED = 2000;

function scrubBounded(value: string): string {
  const withoutBearer = value.replace(BEARER_PAIR, REDACTION_MARKS.redacted);
  const withoutTokens = withoutBearer.replace(TOKEN, (token) =>
    looksLikePii(token) ? REDACTION_MARKS.redacted : token,
  );
  return phoneLikeRuns(withoutTokens).reduce(
    (text, run) => text.replaceAll(run, REDACTION_MARKS.redacted),
    withoutTokens,
  );
}

export const scrubFreeText = (value: string): string =>
  value.length <= MAX_SCANNED
    ? scrubBounded(value)
    : `${scrubBounded(value.slice(0, MAX_SCANNED))}…${REDACTION_MARKS.truncated}`;
