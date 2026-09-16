// The contract between S-X-01's front door and S-X-02 (04 §3.1 steps 1 → 2): the form submits `day` (0–6,
// repeated), `part` (repeated), `area` and `district` as a plain GET, and `1b` reads them back through this one
// parser. Unknown or malformed values are dropped, never thrown — a shared link with a stale query still lands.
import type { QuickMatchDay, QuickMatchPart, QuickMatchQuery } from "../types";
import { QUICK_MATCH_DAYS } from "./quick-match-days";
import { QUICK_MATCH_PARTS } from "./quick-match-parts";

const DAY_VALUES = new Set<number>(QUICK_MATCH_DAYS.map((day) => day.value));
const PART_VALUES = new Set<string>(
  QUICK_MATCH_PARTS.map((part) => part.value),
);
const MAX_TEXT_LENGTH = 60;

const isDay = (value: number): value is QuickMatchDay => DAY_VALUES.has(value);
const isPart = (value: string): value is QuickMatchPart =>
  PART_VALUES.has(value);
const text = (value: string | null): string =>
  (value ?? "").trim().slice(0, MAX_TEXT_LENGTH);

export function parseQuickMatchQuery(
  searchParams: URLSearchParams,
): QuickMatchQuery {
  const days = [
    ...new Set(
      searchParams
        .getAll("day")
        .map((raw) => Number.parseInt(raw, 10))
        .filter(isDay),
    ),
  ].sort((a, b) => a - b);
  const parts = [...new Set(searchParams.getAll("part").filter(isPart))];
  return Object.freeze({
    days,
    parts,
    area: text(searchParams.get("area")),
    district: text(searchParams.get("district")).toUpperCase(),
  });
}
