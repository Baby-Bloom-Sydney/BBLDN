// 01 §4b never-logged list applied to `msg` itself. A message is prose, not a value: the PII sits *inside* it, so
// the whole-value predicate is applied token by token, and the two shapes that span tokens are handled first —
// `Bearer <token>` (two words) and a spaced phone number (`phoneLikeRuns`). Order matters: bearer pairs, then
// tokens, then phone runs, then `scrubString` as the backstop (a residue that still reads as PII is redacted
// whole, and a very long message is truncated).
//
// A message should carry no identifiers at all (01 §4b: ids go in `fields`). One consequence to know: a digit run
// of 9–15 inside prose — an epoch stamp, a date written `2026-09-15 08`, the tail of some uuids — reads as a
// phone number and is redacted. That is the fail-closed side of the trade, and the reason `ts` is a field.
import { looksLikePii } from "../../lib/looks-like-pii";
import { phoneLikeRuns } from "../../lib/phone-like-runs";
import { REDACTION_MARKS } from "../../lib/redaction-marks";
import { scrubString } from "./scrub-string";

const BEARER_PAIR = /\bbearer\s+\S+/gi;
const TOKEN = /\S+/g;

export function scrubMessage(msg: string): string {
  const withoutBearer = msg.replace(BEARER_PAIR, REDACTION_MARKS.redacted);
  const withoutTokens = withoutBearer.replace(TOKEN, (token) =>
    looksLikePii(token) ? REDACTION_MARKS.redacted : token,
  );
  const withoutPhones = phoneLikeRuns(withoutTokens).reduce(
    (text, run) => text.replaceAll(run, REDACTION_MARKS.redacted),
    withoutTokens,
  );
  return scrubString(withoutPhones);
}
