// S-N-07 (04 §4.1 row 12; ADR-153): one of three kinds — a British or Irish passport (a file), a Home Office share
// code with the date of birth it is checked against, or an immigration document (a file).
import { z } from "zod";
import { VETTING } from "@/modules/config";
import { fileField } from "./file-field";
import { isoDateField } from "./iso-date-field";

const SHARE_CODE = new RegExp(VETTING.shareCode.pattern);
const ADULT = 18;

export const rightToWorkSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("british_irish_passport"),
    document: fileField("passport"),
  }),
  z.object({
    kind: z.literal("share_code"),
    shareCode: z
      .string()
      .transform((value) => value.replace(/\s+/g, "").toUpperCase())
      .refine(
        (value) => SHARE_CODE.test(value),
        `Enter the ${VETTING.shareCode.length}-character share code.`,
      ),
    dateOfBirth: isoDateField({ minAge: ADULT }, "date of birth"),
  }),
  z.object({
    kind: z.literal("immigration_document"),
    document: fileField("document"),
  }),
]);
