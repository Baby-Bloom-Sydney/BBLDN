// 04 §7.1 rows 4-8 of the parent rail — the half `1e` left `pending` because the stages behind it did not
// exist. They do now (`1g`).
//
// The wording is 04 §7.1's, taken as written, with one deliberate deviation stated rather than hidden:
// §7.1 row 4 in motion reads `"Meeting with {nanny} — {day} {time}"` and row 6 after reads
// `"Hired — {nanny} starts {date}"`. **There is no road to a nanny's name from here.** `positions` may import
// `connections` and `placements` (01 §2.3) and neither exposes a person; `nanny_public` is a parent's road to a
// nanny and no connector puts it behind these reads. So the lines carry the time and the date and leave the
// name out, rather than rendering a raw id at a family — the same gap `1f` recorded on the admin drawer and
// `1e` on autofire's recipient, and it wants the same fix.
//
// Rows 7 and 8 stay `pending` and say so: row 7 is `payments.getAccess` (`1h`) and row 8 the child-linking read
// model (`1i`). Inventing their states would put a made-up journey on a parent's dashboard, which is the one
// thing 04 §7.1's "never hidden, never empty" rule is *not* asking for.
import { LOCALE } from "@/modules/config";
import type { ConnectionSummary } from "@/modules/connections";
import type { PlacementRead } from "@/modules/placements";
import type { ConnectionStage, JourneyStep } from "@/modules/shared-types";

const step = (
  row: JourneyStep["row"],
  label: string,
  state: JourneyStep["state"],
  detail?: string,
): JourneyStep =>
  Object.freeze({
    row,
    label,
    state,
    ...(detail === undefined ? {} : { detail }),
  });

/** 03 §2.3 row 4: "any connection ≥ `INTRO_SCHEDULED`". The spine order is the enum's (02 §3, C-1). */
const MET_OR_BEYOND: ReadonlySet<ConnectionStage> = new Set([
  "INTRO_COMPLETE",
  "TRIAL_ARRANGED",
  "TRIAL_COMPLETE",
  "AWAITING_RESPONSE",
  "OFFERED",
  "CONFIRMED",
  "ACTIVE",
  "NOT_HIRED",
  "FINISHED",
]);

const SCHEDULED_OR_BEYOND: ReadonlySet<ConnectionStage> = new Set([
  "INTRO_SCHEDULED",
  ...MET_OR_BEYOND,
]);

/** The one timezone and locale this product speaks in — both read from `LOCALE`, never written here (ADR-074). */
function londonWhen(instant: string): string {
  const when = new Date(instant);
  const day = new Intl.DateTimeFormat(LOCALE.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: LOCALE.timezone,
  }).format(when);
  const time = new Intl.DateTimeFormat(LOCALE.locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: LOCALE.timezone,
  })
    .format(when)
    .replace(" ", "")
    .toLowerCase();
  return `${day}, ${time} London time`;
}

const londonDate = (isoDate: string): string =>
  new Intl.DateTimeFormat(LOCALE.locale, {
    day: "numeric",
    month: "long",
    timeZone: LOCALE.timezone,
  }).format(new Date(`${isoDate}T12:00:00Z`));

/** Row 4 — "Meetings" (04 §7.1: before `next`; in motion one line per meeting; after "Met"). */
function rowFour(
  rows: ReadonlyArray<ConnectionSummary>,
  label: string,
): JourneyStep {
  const met = rows.some((row) => MET_OR_BEYOND.has(row.stage));
  if (met) return step(4, label, "done", "Met your nanny");
  const arranged = rows
    .filter((row) => SCHEDULED_OR_BEYOND.has(row.stage))
    .map((row) => row.meetingAt)
    .filter((at): at is NonNullable<typeof at> => at !== undefined);
  if (arranged.length === 0) return step(4, label, "pending");
  const lines = arranged.map((at) => `Meeting — ${londonWhen(at)}`).join(" · ");
  return step(4, label, "in-motion", lines);
}

/**
 * Row 5 — the outcome. 04 §7.1 folds it into Meetings and gives it no label of its own, so the label it is
 * handed is row 4's; what it carries is the question or the answer.
 */
function rowFive(
  rows: ReadonlyArray<ConnectionSummary>,
  label: string,
): JourneyStep {
  const met = rows.filter((row) => MET_OR_BEYOND.has(row.stage));
  if (met.length === 0) return step(5, label, "pending");
  const settled = met.find(
    (row) =>
      row.stage === "OFFERED" ||
      row.stage === "CONFIRMED" ||
      row.stage === "ACTIVE" ||
      row.stage === "TRIAL_ARRANGED" ||
      row.stage === "TRIAL_COMPLETE",
  );
  if (settled === undefined)
    return step(5, label, "in-motion", "How did it go?");
  const detail =
    settled.stage === "TRIAL_ARRANGED" || settled.stage === "TRIAL_COMPLETE"
      ? "A trial is arranged"
      : "You're going ahead with your nanny";
  return step(5, label, "done", detail);
}

/** Row 6 — "Hire" (03 §2.3: placement `CONFIRMED` / `ACTIVE`). */
function rowSix(placement: PlacementRead | null, label: string): JourneyStep {
  if (placement === null) return step(6, label, "pending");
  if (placement.state === "CONFIRMED")
    return step(
      6,
      label,
      "in-motion",
      `Confirming your nanny: ${String(placement.weeklyHours)} hours a week, starting ${londonDate(placement.startDate)}`,
    );
  return step(
    6,
    label,
    "done",
    `Hired — starts ${londonDate(placement.startDate)}`,
  );
}

export function journeyRows4to8(input: {
  readonly connections: ReadonlyArray<ConnectionSummary>;
  readonly placement: PlacementRead | null;
  readonly labels: Readonly<{ meetings: string; hire: string; app: string }>;
}): ReadonlyArray<JourneyStep> {
  return Object.freeze([
    rowFour(input.connections, input.labels.meetings),
    rowFive(input.connections, input.labels.meetings),
    rowSix(input.placement, input.labels.hire),
    // 7 and 8 are `1h`'s and `1i`'s — named, not guessed.
    step(7, input.labels.app, "pending"),
    step(8, input.labels.app, "pending"),
  ]);
}
