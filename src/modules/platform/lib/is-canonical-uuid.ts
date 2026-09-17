// The canonical uuid shape (8-4-4-4-12 hex), in one place because two callers must give the same answer: the
// value heuristic `looks-like-pii.ts`, which has always exempted a uuid, and the event props guard
// `events/lib/pii-safe-string.ts`, which reaches PII through `scrubFreeText` and so used to miss that exemption
// (1d measured 2 944 of 20 000 random v4 uuids refused). 03 §9.3 is explicit — `P.id` is "a uuid or an opaque
// id" — so a uuid is an id, never personal data.
//
// Whole-value only, deliberately: a uuid *inside* prose stays subject to the scrubber's documented in-place
// redaction (`scrub-free-text.ts`, pinned in `platform.log.test.ts`), because in prose the surrounding text is
// what makes a digit run ambiguous and the fail-closed side is the right one to land on.
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True iff the **whole** value is a canonical uuid. */
export const isCanonicalUuid = (value: string): boolean =>
  CANONICAL_UUID.test(value);
