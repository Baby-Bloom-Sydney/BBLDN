// 01 §4a — N1 validated once, at the boundary (S-X-15). Field messages are what the error summary reads out, so
// each names the field in plain words. The mobile is the one UK rule (`normaliseUkMobile`, ADR-102); the area
// arrives as the combobox's two hidden fields; the residency answer is 02 §3's `lead_rtw_status`; the DBS
// question is a yes / no (the stop is the screen's — 04 §4.1 row 4's "shape open"); the age bands are the
// funnel's own list. `ageGroups` arrives as repeated form values.
import { z } from "zod";
import { LOCALE } from "@/modules/config";
import { normaliseUkMobile } from "@/modules/platform";
import type { E164, Email } from "@/modules/shared-types";
import type { NannyAgeGroup, NannyRtwStatus } from "../types";
import { FUNNEL_OPTIONS } from "./funnel-options";

const RTW = FUNNEL_OPTIONS.rtwStatus.map((option) => option.key) as [
  NannyRtwStatus,
  ...NannyRtwStatus[],
];
const AGE_GROUPS = FUNNEL_OPTIONS.ageGroups.map((option) => option.key) as [
  NannyAgeGroup,
  ...NannyAgeGroup[],
];

const yesNo = z
  .enum(["yes", "no"], { error: "Please answer yes or no." })
  .transform((value) => value === "yes");

export const nannyApplicationSchema = z.object({
  firstName: z.string().trim().min(1, "Please enter your first name."),
  lastName: z.string().trim().min(1, "Please enter your last name."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter the email address you want to use.")
    .transform((value) => value as Email),
  mobile: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const e164 = normaliseUkMobile(value);
      if (e164 === null)
        ctx.addIssue({
          code: "custom",
          message: `Please enter a UK mobile number, starting 07 or ${LOCALE.phonePrefix} 7.`,
        });
      return (e164 ?? "") as E164;
    }),
  district: z.string().trim().min(1, "Please pick your area from the list."),
  area: z.string().trim().min(1, "Please pick your area from the list."),
  rtwStatus: z.enum(RTW, {
    error: "Please choose the option that describes your right to work.",
  }),
  hasEnhancedDbs: yesNo,
  yearsExperience: z.coerce
    .number({ error: "Please tell us how many years' experience you have." })
    .int("Please enter whole years.")
    .min(FUNNEL_OPTIONS.yearsExperience.min, "Please enter whole years.")
    .max(
      FUNNEL_OPTIONS.yearsExperience.max,
      "Please check the number of years.",
    ),
  ageGroups: z
    .array(z.enum(AGE_GROUPS), { error: "Please pick at least one age group." })
    .min(1, "Please pick at least one age group."),
});
