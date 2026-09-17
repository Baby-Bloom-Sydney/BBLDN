// 01 §4a — N4 (S-X-18): the bio she wrote (ADR-148). A floor, so the profile a family reads says something.
import { z } from "zod";
import { FUNNEL_OPTIONS } from "./funnel-options";

export const nannyBioSchema = z.object({
  bio: z
    .string()
    .trim()
    .min(
      FUNNEL_OPTIONS.bioMinLength,
      "Please write a few sentences about yourself.",
    ),
});
