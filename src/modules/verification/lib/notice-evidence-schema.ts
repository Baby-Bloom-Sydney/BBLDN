// The scroll-gated notice's evidence fields (02 §4.1 `biometric_consent_records`): four instants the component
// stamped and the seconds between the first and the last. Ordered as the table's own CHECKs order them.
import { z } from "zod";
import { VETTING } from "@/modules/config";

const instant = z.iso.datetime({ offset: true });
// the client stamps the instants; the server holds a plausibility floor on the open → scrolled interval
// (`VETTING.biometricNotice.minReadSeconds`; security pass M3): a form fired before the notice could have
// been read is refused whatever the instants claim
const seconds = (from: string, to: string): number =>
  (Date.parse(to) - Date.parse(from)) / 1000;

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
  )
  .refine(
    (value) =>
      seconds(value.noticeOpenedAt, value.noticeScrollCompletedAt) >=
      VETTING.biometricNotice.minReadSeconds,
    "Please take a moment to read the notice before you tick the box.",
  );
