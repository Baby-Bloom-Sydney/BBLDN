// An `ISODate` at the boundary (01 §4a "validated once, at the boundary"): `YYYY-MM-DD`, and a real day.
//
// The shape alone is not enough — `2025-02-30` matches any plausible regex and is not a date. `Date.parse` of
// a bare `YYYY-MM-DD` is UTC midnight by specification, so round-tripping the parsed value back to its ISO day
// is what separates a real date from a well-shaped one, with no timezone in the answer either way.
import type { ISODate } from "@/modules/shared-types";

const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is ISODate {
  if (!SHAPE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}
