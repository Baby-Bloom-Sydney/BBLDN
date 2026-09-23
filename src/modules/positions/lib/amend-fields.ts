// The boundary validator for `amend()`'s payload (01 §4a: validated once, at the boundary).
//
// `AmendableFields` is `Readonly<Record<string, unknown>>` in `shared-types` because the stage model shares the
// shape across entities — `placements` amends hours, rate and start (03 §2.2). A **position** has exactly one
// amendable fact: the detail it was opened with. So this file answers the narrow question "is this a position
// amend, and is its detail a detail" and refuses everything else.
//
// **Unknown keys fail the whole amend; they are not dropped.** `parseWizardAnswers` drops unknown keys because a
// stale lead blob must still read back; an amend is a deliberate write a caller is about to be told succeeded,
// and telling her `hoursPerWeek` was saved when this module has nowhere to put it is the same lie the unapplied
// `input.fields` told. Refusing names the gap instead.
import { z } from "zod";
import { err, ok } from "@/modules/platform";
import type { Instant, Result } from "@/modules/shared-types";
import type { PositionMatchDetail } from "../types";
import type { StageErrorDetails } from "../types";

const MAX_TEXT = 80;
const MAX_LIST = 12;
const MAX_CHILDREN = 8;
const MAX_MONTHS = 18 * 12;
const MAX_CAPACITY = 8;
const MAX_YEARS = 60;
const MAX_RUNG = 10;
const MAX_AGE = 99;

const text = z.string().trim().max(MAX_TEXT);
const day = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
const part = z.enum(["morning", "midday", "afternoon", "evening"]);
const months = z.number().int().min(0).max(MAX_MONTHS);

const DETAIL_SCHEMA = z
  .object({
    area: z.object({ area: text, district: text }).strict(),
    schedule: z
      .object({
        type: z.enum(["Fixed", "Flexible"]),
        blocks: z.array(z.object({ day, part }).strict()).max(7 * 4),
      })
      .strict()
      .nullable(),
    requirements: z
      .object({
        childAgeMonths: z
          .array(z.object({ min: months, max: months }).strict())
          .max(MAX_CHILDREN),
        capacity: z.number().int().min(0).max(MAX_CAPACITY),
        specialNeeds: z.boolean(),
        licence: z.boolean(),
        car: z.boolean(),
        vaccination: z.boolean(),
        nonSmoker: z.boolean(),
        pets: z.boolean(),
        nannyAge: z
          .object({
            min: z.number().int().min(0).max(MAX_AGE).optional(),
            max: z.number().int().min(0).max(MAX_AGE).optional(),
          })
          .strict()
          .optional(),
        languages: z.array(text).max(MAX_LIST).optional(),
        roleType: text,
        supportNeeds: z.array(text).max(MAX_LIST).optional(),
      })
      .strict(),
    startDate: z.string().trim().max(MAX_TEXT).optional(),
    minExperienceYears: z.number().int().min(0).max(MAX_YEARS).optional(),
    minQualificationRung: z.number().int().min(0).max(MAX_RUNG).optional(),
  })
  .strict();

const invalid = (which: string) =>
  err("VALIDATION", "We couldn't save that change.", {
    reason: "E_PAYLOAD_INVALID" as const,
    entity: "position" as const,
    which,
  } satisfies StageErrorDetails);

/** The one fact a position amend may carry (03 §2.2 for the position; the placement's three are its own). */
const AMENDABLE_KEYS: ReadonlyArray<string> = Object.freeze(["detail"]);

/**
 * `AmendableFields` → the typed change this module knows how to apply. A refusal is a refusal: the caller is
 * never told a field was saved that this module has no column for.
 */
export function positionAmendment(
  fields: Readonly<Record<string, unknown>>,
): Result<{ readonly detail: PositionMatchDetail }, StageErrorDetails> {
  const keys = Object.keys(fields);
  if (keys.length === 0) return invalid("empty");
  const unknown = keys.filter((key) => !AMENDABLE_KEYS.includes(key));
  if (unknown.length > 0) return invalid(unknown.join(","));
  const parsed = DETAIL_SCHEMA.safeParse(fields.detail);
  if (!parsed.success) return invalid("detail");
  const value = parsed.data;
  // `startDate` is an `Instant` on the record; the schema proves it is a bounded string and the column keeps
  // day precision (`position-row.ts`). Nothing here widens what the caller sent.
  return ok(
    Object.freeze({
      detail: Object.freeze({
        ...value,
        ...(value.startDate === undefined
          ? {}
          : { startDate: value.startDate as Instant }),
      }) as PositionMatchDetail,
    }),
  );
}
