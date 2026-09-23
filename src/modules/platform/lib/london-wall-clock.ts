// The London wall clock at an instant — the one reader for "today / yesterday in London" (01 §4f: "each handler
// derives today / yesterday in the configured zone") and for "is it the declared London hour"
// (`api/_lib/cron-is-due`).
//
// It lives in `platform` rather than in a cron file because the answer is needed on both sides of the boundary:
// the cron due-gate in `src/app/api` and the handlers inside modules. The timezone is `LOCALE.timezone`, never a
// literal (`check:config-literals`), and `Intl` owns the BST transition dates so nothing here carries a table that
// could go stale — the same rule `scheduling/lib/london-offset-minutes.ts` follows for the offset question.
import { LOCALE } from "@/modules/config";
import type { Instant, Weekday } from "@/modules/shared-types";
import type { LondonWallClock } from "../types";

// `en-CA` because its short date format *is* `YYYY-MM-DD`; `hourCycle: "h23"` because `hour12: false` renders
// midnight as 24 in several locales, which would put a midnight job on the wrong London date.
const FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: LOCALE.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAYS: ReadonlyArray<string> = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

export function londonWallClock(at: Instant | Date): LondonWallClock {
  const parts = FORMATTER.formatToParts(at instanceof Date ? at : new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const weekday = WEEKDAYS.indexOf(part("weekday"));
  if (weekday < 0)
    throw new Error(
      `londonWallClock: Intl returned an unrecognised weekday "${part("weekday")}"`,
    );
  return Object.freeze({
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
    minute: Number(part("minute")),
    weekday: weekday as Weekday,
  });
}
