// 03 §9.2 rule 3 / 07 §4.44 — the string every props schema uses: bounded, and it refuses anything shaped like
// an email, a phone number, a JWT or a provider key. Ids, enum-like labels, paths and districts pass.
import { z } from "zod";
import { looksLikePii } from "../../lib/looks-like-pii";

const MAX_LENGTH = 256;

export const piiSafeString = z
  .string()
  .min(1)
  .max(MAX_LENGTH)
  .refine((value) => !looksLikePii(value), {
    message: "looks like personal data (email / phone / token)",
  });
