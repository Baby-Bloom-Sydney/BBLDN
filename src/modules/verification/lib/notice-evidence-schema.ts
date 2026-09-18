// The scroll-gated notice's evidence fields (02 §4.1 `biometric_consent_records`): four instants the component
// stamped and the seconds between the first and the last. Ordered as the table's own CHECKs order them.
import { z } from "zod";

const instant = z.iso.datetime({ offset: true });

export const noticeEvidenceSchema = z
  .object({
    noticeOpenedAt: instant,
    noticeScrollCompletedAt: instant,
    checkboxesEnabledAt: instant,
    consent: z.literal("on", { message: "Please tick the box to consent." }),
  })
  .refine(
    (value) =>
      value.noticeOpenedAt <= value.noticeScrollCompletedAt &&
      value.noticeScrollCompletedAt <= value.checkboxesEnabledAt,
    "Please read the notice to the end before you tick the box.",
  );
