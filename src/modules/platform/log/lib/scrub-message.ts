// 01 §4b's never-logged list applied to `msg` itself: the free-text scrubber, then `scrubString` as the backstop
// (a residue that still reads as PII whole is redacted whole, and an over-long message is truncated).
//
// A message should carry no identifiers at all (01 §4b: ids go in `fields`). One consequence to know: a digit run
// of 9–15 inside prose — an epoch stamp, a date written `2026-09-15 08`, the numeric tail of a hex-lettered uuid —
// reads as a phone number and is redacted in place. That is the fail-closed side of the trade, and the reason
// `ts`, `userId` and `requestId` are fields. Pinned by a test so it stays a decision, not an accident.
import { scrubFreeText } from "../../lib/scrub-free-text";
import { scrubString } from "./scrub-string";

export const scrubMessage = (msg: string): string =>
  scrubString(scrubFreeText(msg));
