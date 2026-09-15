// The building blocks the 17 group schema files share (one type group — the zod primitives of 03 §9.3's Props
// column): ids, instants, dates, counts, pence, districts, and `props(shape)` = strict + readonly object.
import { z } from "zod";
import { TRANSITION_IDS } from "@/modules/shared-types";
import { piiSafeString } from "./pii-safe-string";

const ID_MAX = 64;
const DISTRICT_MAX = 8;

export const PROPS_PARTS = Object.freeze({
  /** a uuid or an opaque provider / stub id — never a name */
  id: piiSafeString.max(ID_MAX),
  label: piiSafeString,
  instant: z.iso.datetime({ offset: true }),
  isoDate: z.iso.date(),
  count: z.number().int().nonnegative(),
  pence: z.number().int(),
  district: piiSafeString.max(DISTRICT_MAX),
  transition: z.enum(TRANSITION_IDS),
  /** `fields*` = keys only (03 §9.3) */
  fields: z.array(piiSafeString).min(1),
  props: <T extends z.ZodRawShape>(shape: T) =>
    z.strictObject(shape).readonly(),
});
