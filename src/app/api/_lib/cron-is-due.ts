// Is this fire the one the schedule meant? (01 §4f: "the handler gates on the London hour if it must be exact".)
//
// `vercel.json` carries **both** candidate UTC hours for a declared London time — the GMT one and the BST one —
// because no single UTC expression is 09:00 London all year. Exactly one of the two is the declared London time on
// any given day; this gate is what discards the other, so the job fires twice in UTC and acts once per London day.
// Putting it here rather than in each handler is the point: a handler cannot forget it, and a cron added later
// inherits it (`ecc-lite` rule 1 — prefer a gate to a rule).
//
// The window is deliberately asymmetric and deliberately narrower than an hour:
//   EARLY  5 minutes — Vercel may deliver a little before the minute;
//   LATE  50 minutes — Vercel may deliver late, and a run held behind a cold start must not be thrown away;
//   the two candidate fires are 60 minutes apart, so 55 minutes of tolerance can never admit both.
// An `every` cron declares no London hour and is never gated; a handler that cares (Katie's 07:00–22:00 waking
// window, `08.22`) reads `londonWallClock` itself.
import type { CronSpec } from "@/modules/config";
import { londonWallClock } from "@/modules/platform";
import type { Instant } from "@/modules/shared-types";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

const EARLY_TOLERANCE_MINUTES = 5;
const LATE_TOLERANCE_MINUTES = 50;

/** The signed distance from `declared` to `actual`, wrapped so that midnight is adjacent to 23:59. */
function signedOffsetWithin(
  cycle: number,
  actual: number,
  declared: number,
): number {
  const forward = (((actual - declared) % cycle) + cycle) % cycle;
  return forward > cycle / 2 ? forward - cycle : forward;
}

export function cronIsDue(london: CronSpec["london"], now: Instant): boolean {
  if (london.kind === "every") return true;

  const clock = londonWallClock(now);
  const actualMinuteOfDay = clock.hour * MINUTES_PER_HOUR + clock.minute;
  const declaredMinuteOfDay = london.hour * MINUTES_PER_HOUR + london.minute;

  const offset =
    london.kind === "weekly"
      ? signedOffsetWithin(
          MINUTES_PER_WEEK,
          clock.weekday * MINUTES_PER_DAY + actualMinuteOfDay,
          london.weekday * MINUTES_PER_DAY + declaredMinuteOfDay,
        )
      : signedOffsetWithin(
          MINUTES_PER_DAY,
          actualMinuteOfDay,
          declaredMinuteOfDay,
        );

  return offset >= -EARLY_TOLERANCE_MINUTES && offset <= LATE_TOLERANCE_MINUTES;
}
