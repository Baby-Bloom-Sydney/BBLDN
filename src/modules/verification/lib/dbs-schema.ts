// S-N-06 (04 §4.1 row 11; `05.29`): the certificate (image or PDF), the certificate number in config's shape,
// the issue date, and consent to the Update Service status check (kickoff §4.3 default; 07 §3 class D).
import { z } from "zod";
import { VETTING } from "@/modules/config";
import { fileField } from "./file-field";
import { isoDateField } from "./iso-date-field";

const NUMBER = new RegExp(VETTING.dbsCertificateNumber.pattern);

export const dbsSchema = z.object({
  certificate: fileField("certificate"),
  certificateNumber: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .refine(
      (value) => NUMBER.test(value),
      `Enter the ${VETTING.dbsCertificateNumber.length}-digit certificate number.`,
    ),
  issueDate: isoDateField({ notFuture: true }, "issue date"),
  updateServiceConsent: z.literal("on", {
    message: "Please tick the Update Service box.",
  }),
});
