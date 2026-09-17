// 01 §4a — N3 validated once (S-X-17): the role types from the funnel's list, the availability grid as the one
// shape `nannies.availability` and `position_schedule` share (02 §4.2), and the rate band as whole pounds per hour
// turned into pence. The grid arrives as one JSON field because a seven-by-four checkbox matrix is not a form
// the summary can name field by field; the shape is checked here, not trusted.
import { z } from "zod";
import type { NannyRoleType } from "../types";
import { availabilityField } from "./availability-field";
import { FUNNEL_OPTIONS } from "./funnel-options";

const ROLE_TYPES = FUNNEL_OPTIONS.roleTypes.map((option) => option.key) as [
  NannyRoleType,
  ...NannyRoleType[],
];
const PENCE = 100;

export const nannyPortfolioSchema = z
  .object({
    roleTypes: z
      .array(z.enum(ROLE_TYPES), {
        error: "Please pick at least one type of work.",
      })
      .min(1, "Please pick at least one type of work."),
    availability: availabilityField,
    rateMin: z.coerce
      .number({ error: "Please enter your lowest hourly rate." })
      .min(
        FUNNEL_OPTIONS.rate.minPerHour,
        "Please enter your lowest hourly rate.",
      )
      .max(FUNNEL_OPTIONS.rate.maxPerHour, "Please check your hourly rate."),
    rateMax: z.coerce
      .number({ error: "Please enter your highest hourly rate." })
      .min(
        FUNNEL_OPTIONS.rate.minPerHour,
        "Please enter your highest hourly rate.",
      )
      .max(FUNNEL_OPTIONS.rate.maxPerHour, "Please check your hourly rate."),
  })
  .refine((data) => data.rateMax >= data.rateMin, {
    message: "Your highest rate can't be below your lowest.",
    path: ["rateMax"],
  })
  .transform(({ roleTypes, availability, rateMin, rateMax }) => ({
    roleTypes,
    availability,
    rateBand: {
      minPence: Math.round(rateMin * PENCE),
      maxPence: Math.round(rateMax * PENCE),
    },
  }));
