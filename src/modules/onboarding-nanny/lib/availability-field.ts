// The availability grid as one form field (S-X-17 · S-N-18): the JSON is parsed, the shape checked against the
// one `nannies.availability` / `position_schedule` share (02 §4.2 — day → blocks), and empty days dropped so the
// stored grid says only when she is free. `partialRecord`, because a week with no Wednesday is a week, not a
// refusal (zod 4's `record` over an enum key is exhaustive).
import { z } from "zod";
import { FUNNEL_OPTIONS } from "./funnel-options";
import type { NannyAvailability, NannyDayBlock, NannyWeekday } from "../types";

const WEEKDAYS = FUNNEL_OPTIONS.weekdays as ReadonlyArray<string>;
const BLOCKS = FUNNEL_OPTIONS.dayBlocks as ReadonlyArray<string>;

const availabilityShape = z.partialRecord(
  z.enum(WEEKDAYS as [string, ...string[]]),
  z.array(z.enum(BLOCKS as [string, ...string[]])),
);

/** Parses the JSON, checks the shape, and drops empty days so the stored grid says only when she is free. */
export const availabilityField = z
  .string()
  .transform((raw, ctx): NannyAvailability => {
    const bad = (): NannyAvailability => {
      ctx.addIssue({ code: "custom", message: "Please mark at least one time you're available." });
      return {};
    };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return bad();
    }
    const checked = availabilityShape.safeParse(parsed);
    if (!checked.success) return bad();
    const days = Object.entries(checked.data).filter(([, blocks]) => (blocks ?? []).length > 0);
    if (days.length === 0) return bad();
    return Object.fromEntries(days) as Readonly<
      Partial<Record<NannyWeekday, ReadonlyArray<NannyDayBlock>>>
    >;
  });
