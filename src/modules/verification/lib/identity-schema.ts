// S-N-05 (04 §4.1 row 10; 04 §6.3): a UK id type from config (`VETTING.identityEvidence`), the document and a
// live selfie (or an uploaded photo — the a11y-5 alternative), the declared names and date of birth the
// cross-check reads (03 §4.3), and the AGR-04 tick.
import { z } from "zod";
import { VETTING } from "@/modules/config";
import { fileField } from "./file-field";
import { isoDateField } from "./iso-date-field";

const ADULT = 18;

export const identitySchema = z.object({
  idType: z.enum(VETTING.identityEvidence, {
    message: "Pick one of the listed documents.",
  }),
  document: fileField("document"),
  selfie: fileField("selfie"),
  surname: z
    .string()
    .trim()
    .min(1, "Enter your surname as it appears on the document.")
    .max(120),
  givenNames: z
    .string()
    .trim()
    .min(1, "Enter your given names as they appear on the document.")
    .max(160),
  dateOfBirth: isoDateField({ minAge: ADULT }, "date of birth"),
  consent: z.literal("on", {
    message: "Please read the notice and tick the box.",
  }),
});
