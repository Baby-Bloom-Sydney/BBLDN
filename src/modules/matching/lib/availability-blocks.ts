// `nannies.availability` jsonb (02 §4.2: day → `morning · midday · afternoon · evening`, one shape) → `scoring`
// blocks. Days are named (`monday` … `sunday`) or numbered `0`–`6` with Monday = 0 (02 §4.4 / ADR-118 (c));
// anything the shape does not name is dropped, never thrown — a malformed profile scores as unavailable.
import type { Json } from "@/modules/shared-types";
import type { ScheduleBlock } from "@/modules/scoring";

const DAY_NAMES: ReadonlyArray<string> = Object.freeze([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
const PARTS: ReadonlySet<string> = new Set([
  "morning",
  "midday",
  "afternoon",
  "evening",
]);

const dayOf = (key: string): ScheduleBlock["day"] | null => {
  const named = DAY_NAMES.indexOf(key.toLowerCase());
  const index = named >= 0 ? named : Number.parseInt(key, 10);
  return index >= 0 && index <= 6 ? (index as ScheduleBlock["day"]) : null;
};

const isPart = (value: unknown): value is ScheduleBlock["part"] =>
  typeof value === "string" && PARTS.has(value);

const PART_ORDER: ReadonlyArray<string> = Object.freeze([...PARTS]);

const byDayThenPart = (left: ScheduleBlock, right: ScheduleBlock): number =>
  left.day - right.day ||
  PART_ORDER.indexOf(left.part) - PART_ORDER.indexOf(right.part);

export function availabilityBlocks(
  raw: Json | null | undefined,
): ReadonlyArray<ScheduleBlock> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
  return Object.freeze(
    Object.entries(raw)
      .flatMap(([key, parts]) => {
        const day = dayOf(key);
        if (day === null || !Array.isArray(parts)) return [];
        return parts.filter(isPart).map((part) => ({ day, part }));
      })
      .sort(byDayThenPart),
  );
}
