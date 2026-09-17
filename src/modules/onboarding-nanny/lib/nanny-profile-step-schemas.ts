// 01 §4a — S-N-18's ten steps, one schema each, keyed by `PROFILE_STEPS[i].id`. Each parses exactly the fields
// its step names and answers the two halves `update_nanny_profile()` takes (ADR-152 (2)): the `nannies`
// columns and the `user_profiles` contact columns. Yes / no radios arrive as "yes" / "no"; lists as repeated
// values; the grid as the portfolio's JSON field; the rate as whole pounds per hour.
import { z } from "zod";
import { LOCALE, MATCHING } from "@/modules/config";
import { normaliseUkMobile } from "@/modules/platform";
import type { ISODate } from "@/modules/shared-types";
import type {
  NannyContactPatch,
  NannyProfilePatch,
  ProfileStepId,
} from "../types";
import { availabilityField } from "./availability-field";
import { FUNNEL_OPTIONS } from "./funnel-options";

type StepPatch = {
  readonly profile?: NannyProfilePatch;
  readonly contact?: NannyContactPatch;
};

const yesNo = z
  .enum(["yes", "no"], { error: "Please answer yes or no." })
  .transform((v) => v === "yes");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a date as YYYY-MM-DD.")
  .transform((v) => v as ISODate);
const list = (message: string) =>
  z.array(z.string().trim().min(1)).min(1, message);
const QUALIFICATIONS = MATCHING.qualificationLadder.map((rung) => rung.key);
const AGE_GROUPS = FUNNEL_OPTIONS.ageGroups.map((option) => option.key) as [
  string,
  ...string[],
];
const PENCE = 100;

const step = <S extends z.ZodTypeAny>(
  schema: S,
  toPatch: (data: z.output<S>) => StepPatch,
) => Object.freeze({ schema, toPatch });

export const nannyProfileStepSchemas = Object.freeze({
  location: step(
    z.object({
      district: z
        .string()
        .trim()
        .min(1, "Please pick your area from the list."),
      area: z.string().trim().min(1, "Please pick your area from the list."),
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
          return e164 ?? ("" as never);
        }),
    }),
    (d) => ({
      contact: { district: d.district, area: d.area, mobile: d.mobile },
    }),
  ),
  "date-of-birth": step(z.object({ dateOfBirth: isoDate }), (d) => ({
    contact: { dateOfBirth: d.dateOfBirth },
  })),
  experience: step(
    z.object({
      yearsExperience: z.coerce
        .number({
          error: "Please tell us how many years' experience you have.",
        })
        .int("Please enter whole years.")
        .min(FUNNEL_OPTIONS.yearsExperience.min)
        .max(
          FUNNEL_OPTIONS.yearsExperience.max,
          "Please check the number of years.",
        ),
      ageGroups: z
        .array(z.enum(AGE_GROUPS))
        .min(1, "Please pick at least one age group."),
    }),
    (d) => ({ profile: { yearsExperience: d.yearsExperience } }),
  ),
  qualification: step(
    z.object({
      qualification: z.enum(QUALIFICATIONS as [string, ...string[]], {
        error: "Please pick the qualification that fits best.",
      }),
    }),
    (d) => ({ profile: { qualification: d.qualification } }),
  ),
  certificates: step(
    z.object({ certificates: z.array(z.string().trim().min(1)) }),
    (d) => ({
      profile: { certificates: d.certificates },
    }),
  ),
  languages: step(
    z.object({ languages: list("Please add at least one language.") }),
    (d) => ({
      profile: { languages: d.languages },
    }),
  ),
  practical: step(
    z.object({
      hasCar: yesNo,
      hasDrivingLicence: yesNo,
      isNonSmoker: yesNo,
      comfortableWithPets: yesNo,
    }),
    (d) => ({ profile: { ...d } }),
  ),
  availability: step(z.object({ availability: availabilityField }), (d) => ({
    profile: { availability: d.availability },
  })),
  rate: step(
    z.object({
      hourlyRateMin: z.coerce
        .number({ error: "Please enter your lowest hourly rate." })
        .min(
          FUNNEL_OPTIONS.rate.minPerHour,
          "Please enter your lowest hourly rate.",
        )
        .max(FUNNEL_OPTIONS.rate.maxPerHour, "Please check your hourly rate."),
      availableFrom: isoDate
        .optional()
        .or(z.literal("").transform(() => undefined)),
    }),
    (d) => ({
      profile: {
        hourlyRateMinPence: Math.round(d.hourlyRateMin * PENCE),
        ...(d.availableFrom === undefined
          ? {}
          : { availableFrom: d.availableFrom }),
      },
    }),
  ),
  "about-you": step(
    z.object({
      bio: z
        .string()
        .trim()
        .min(
          FUNNEL_OPTIONS.bioMinLength,
          "Please write a few sentences about yourself.",
        )
        .max(FUNNEL_OPTIONS.bioMaxLength, "Please keep it under a page."),
    }),
    (d) => ({ profile: { bio: d.bio } }),
  ),
} satisfies Record<ProfileStepId, unknown>);
