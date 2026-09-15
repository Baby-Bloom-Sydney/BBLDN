// The phone-number half of the PII value heuristic (01 §4b), extracted so the predicate (`looksLikePii`) and the
// substitution (the log's message scrubber) share one definition of the shape: 9–15 digits, optionally spaced,
// dashed or bracketed. A uuid or a long numeric id has more digits and falls outside the range.
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{7,}\d/g;
const PHONE_DIGITS_MIN = 9;
const PHONE_DIGITS_MAX = 15;

/** Every substring of `value` that reads as a phone number. Empty when there is none. */
export function phoneLikeRuns(value: string): ReadonlyArray<string> {
  return [...value.matchAll(PHONE_CANDIDATE)]
    .map((match) => match[0])
    .filter((run) => {
      const digits = run.replace(/\D/g, "").length;
      return digits >= PHONE_DIGITS_MIN && digits <= PHONE_DIGITS_MAX;
    });
}
