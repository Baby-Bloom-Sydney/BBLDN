// 03 §9.2 rule 3 / 07 §4.44 — the string every props schema uses: bounded, and it refuses anything shaped like
// an email, a phone number, a JWT or a provider key. Ids, enum-like labels, paths and districts pass.
//
// The check is `scrubFreeText`, not `looksLikePii` directly (S3b): a prop such as `label` or `landingPath` is
// free text, and `looksLikePii` anchors JWT / provider key / bearer at the start of the string, so a key pasted
// mid-value used to pass validation and enter the event pipeline. If the scrubber would change the value, the
// value is not PII-safe.
//
// **A canonical uuid is exempt, and it must be** (P1-WIRE-2, closing the defect `1d` measured). `looksLikePii`
// has always exempted one; `scrubFreeText` does not, because its phone pass runs over the whole string rather
// than token by token, and a uuid whose hex groups hold a nine-digit run across the hyphens reads as a phone
// number. Measured on this tree before the fix: **2 904 of 20 000** random v4 uuids refused (14.5 %). 03 §9.3
// says `P.id` is "a uuid or an opaque id", so under a unit of work that failed the whole C row — `chooseSlot`
// would have failed roughly one call in seven against real booking ids.
//
// The exemption is **whole-value only** and is checked *before* the scrub, never by weakening the scrubber: a
// uuid embedded in prose is still redacted in place, which is the documented fail-closed trade-off pinned in
// `platform.log.test.ts`. Every non-uuid value is judged exactly as it was.
import { z } from "zod";
import { isCanonicalUuid } from "../../lib/is-canonical-uuid";
import { scrubFreeText } from "../../lib/scrub-free-text";

const MAX_LENGTH = 256;

export const piiSafeString = z
  .string()
  .min(1)
  .max(MAX_LENGTH)
  .refine((value) => isCanonicalUuid(value) || scrubFreeText(value) === value, {
    message: "looks like personal data (email / phone / token)",
  });
