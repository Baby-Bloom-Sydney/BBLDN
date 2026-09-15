// The number half of the value heuristic (07 §9.2): a phone number logged as a `number` is still a phone number,
// so a 9–15 digit integer under a benign key is redacted like the string would be.
//
// One exemption, and it is deliberate: a **millisecond epoch** is 13 digits from 2001 to 2096, so every timestamp
// ever logged as a number would otherwise vanish — destroying the operational context the scrubber exists to keep
// readable, in the structured half of the line where an operator most needs it. No phone number lands in that
// band (a UK mobile as an integer is 4.4 × 10¹¹, a US one 1.2 × 10¹⁰). Instants are ISO strings by contract
// (01 §4b), so this is a safety net for code that logs `Date.now()`, not a licence to.
import { phoneLikeRuns } from "./phone-like-runs";

const MS_EPOCH_MIN = 1_000_000_000_000;
const MS_EPOCH_MAX = 4_000_000_000_000;

export function isPhoneLikeNumber(value: number | bigint): boolean {
  if (value >= MS_EPOCH_MIN && value <= MS_EPOCH_MAX) return false;
  return phoneLikeRuns(String(value)).length > 0;
}
