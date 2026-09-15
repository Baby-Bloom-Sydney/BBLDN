// 03 §9.2 `Attribution`: `referrer` is a hostname only (no scheme, path or query — those carry search terms and
// ids); every string is PII-safe; unknown keys rejected. `fbclid` is stripped at emit unless marketing consent
// holds (07 §2.9) — that is `createEvents`' job, not the schema's.
import { z } from "zod";
import { piiSafeString } from "./pii-safe-string";

const HOSTNAME =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

export const attributionSchema = z
  .strictObject({
    src: z.enum(["std", "adv"]).optional(),
    lead: piiSafeString.optional(),
    utm: z
      .strictObject({
        source: piiSafeString.optional(),
        medium: piiSafeString.optional(),
        campaign: piiSafeString.optional(),
        content: piiSafeString.optional(),
        term: piiSafeString.optional(),
      })
      .readonly()
      .optional(),
    referrer: piiSafeString.regex(HOSTNAME, "hostname only").optional(),
    landingPath: piiSafeString.optional(),
    fbclid: piiSafeString.optional(),
  })
  .readonly();
