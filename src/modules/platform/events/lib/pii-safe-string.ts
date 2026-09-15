// 03 §9.2 rule 3 / 07 §4.44 — the string every props schema uses: bounded, and it refuses anything shaped like
// an email, a phone number, a JWT or a provider key. Ids, enum-like labels, paths and districts pass.
//
// The check is `scrubFreeText`, not `looksLikePii` directly (S3b): a prop such as `label` or `landingPath` is
// free text, and `looksLikePii` anchors JWT / provider key / bearer at the start of the string, so a key pasted
// mid-value used to pass validation and enter the event pipeline. If the scrubber would change the value, the
// value is not PII-safe.
import { z } from "zod";
import { scrubFreeText } from "../../lib/scrub-free-text";

const MAX_LENGTH = 256;

export const piiSafeString = z
  .string()
  .min(1)
  .max(MAX_LENGTH)
  .refine((value) => scrubFreeText(value) === value, {
    message: "looks like personal data (email / phone / token)",
  });
