// 04 §7.1 rows 4-8 of the parent rail — the half `1e` left `pending` because the stages behind it did not
// exist. They do now (`1g`).
//
// The wording is 04 §7.1's, taken as written. `1e` shipped rows 4-6 **without the `{nanny}` the document writes
// on them**, because nothing put a person behind the read; `2d` closed that (kickoff debt 2) and nothing new is
// imported to do it. `ConnectionSummary` now carries `nannyFirstName`, filled by `connections` from the one
// `nanny_public` read (07 §5.1 rule 4 keeps contact detail out of that view, so it is a name and nothing more).
// Row 6 is keyed by the placement, and the placement carries `connectionId`, so its name comes from **that**
// connection (I-3: exactly one) rather than from whichever summary sorted first.
//
// A summary with no name is still the normal case for a nanny who has left the pool or been isolated since, and
// every line below keeps the nameless form it had before — a raw id in front of a family is worse than no name.
//
// `1i` fills rows 7 and 8. Both arrive as **plain data on the input**, never as an import: 01 §2.3 gives
// `positions` arrows to `connections` and `placements` and to neither `payments` nor `app`, and row 3 already
// established the pattern — the words are composed here, the facts are handed in by the caller that may read
// them (`loadParentJourney`, which is a route-level read and may). `appRow` being absent means "the caller did
// not ask", and both rows then read `pending` exactly as they did before, rather than claiming a standing.
//
// ★ CONTRADICTION inside 04, stopped on and ruled rather than guessed (model-marking rule). §7.1 row 7 gives
// the in-motion trial line as `"Your app is open — {n} days"`; §3 says, of the same state, "no in-app countdown
// banner (ruling carried)", and the standing memory rule is the same — no ambient in-app countdown, the T-5
// email carries the urgency. A day count on the rail **is** an ambient countdown; it is on every dashboard
// load, which is more ambient than a banner. So the line reads "Your app is open" with no number, the omission
// is pinned by test, and the owner of the disagreement is 04 §7.1 (its row wants amending to match its own §3).
import { LOCALE } from "@/modules/config";
import type { ConnectionSummary } from "@/modules/connections";
import type { PlacementRead } from "@/modules/placements";
import type { ConnectionStage, JourneyStep } from "@/modules/shared-types";

/**
 * Rows 7 and 8's facts, structurally. `standing` is `payments`' `AccessState["state"]` and `reason` the gate's
 * `AccessReason`; `link` is `app/child-linking`'s `AppLinkFacts`. Declared locally because neither module is
 * reachable from here — the ADR-119 precedent, used for the same reason.
 */
export type AppRailFacts = {
  readonly standing:
    | "none"
    | "deposit-paid"
    | "placed"
    | "trial"
    | "active"
    | "paid-in-full"
    | "lapsed"
    | "toggled";
  readonly open: boolean;
  /** The nanny's first day, for the `placed` line (04 §7.1: "Your app — from {start date}"). */
  readonly appOnFrom?: string;
  /** ADR-094: a week after the nanny starts, and the only date this row ever shows. */
  readonly paymentDueAt?: string;
  readonly link?: {
    readonly hasChild: boolean;
    readonly invitePending: boolean;
    readonly nannyLinked: boolean;
  };
};

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

/** 04 §7.1 `{nanny}` — her first name, or the nameless phrasing when the read had no row for her. */
const named = (
  row: ConnectionSummary | undefined,
  withName: (name: string) => string,
  without: string,
): string =>
  row?.nannyFirstName === undefined ? without : withName(row.nannyFirstName);

/** Row 4 — "Meetings" (04 §7.1: before `next`; in motion one line per meeting; after "Met"). */
function rowFour(
  rows: ReadonlyArray<ConnectionSummary>,
  label: string,
): JourneyStep {
  const met = rows.find((row) => MET_OR_BEYOND.has(row.stage));
  if (met !== undefined)
    return step(
      4,
      label,
      "done",
      named(met, (name) => `Met ${name}`, "Met your nanny"),
    );
  const arranged = rows.filter(
    (row) => SCHEDULED_OR_BEYOND.has(row.stage) && row.meetingAt !== undefined,
  );
  if (arranged.length === 0) return step(4, label, "pending");
  const lines = arranged
    .map(
      (row) =>
        `${named(row, (name) => `Meeting with ${name}`, "Meeting")} — ${londonWhen(row.meetingAt as string)}`,
    )
    .join(" · ");
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
      ? named(
          settled,
          (name) => `A trial with ${name} is arranged`,
          "A trial is arranged",
        )
      : named(
          settled,
          (name) => `You're going ahead with ${name}`,
          "You're going ahead with your nanny",
        );
  return step(5, label, "done", detail);
}

/**
 * Row 6 — "Hire" (03 §2.3: placement `CONFIRMED` / `ACTIVE`). The name is taken from the connection the
 * placement names, not from the list: I-3 makes that connection the single one this hire is about.
 */
function rowSix(
  placement: PlacementRead | null,
  rows: ReadonlyArray<ConnectionSummary>,
  label: string,
): JourneyStep {
  if (placement === null) return step(6, label, "pending");
  const hired = rows.find(
    (row) =>
      (row.connectionId as string) === (placement.connectionId as string),
  );
  const starts = londonDate(placement.startDate);
  if (placement.state === "CONFIRMED")
    return step(
      6,
      label,
      "in-motion",
      `${named(hired, (name) => `Confirming ${name}`, "Confirming your nanny")}: ${String(placement.weeklyHours)} hours a week, starting ${starts}`,
    );
  return step(
    6,
    label,
    "done",
    named(
      hired,
      (name) => `Hired — ${name} starts ${starts}`,
      `Hired — starts ${starts}`,
    ),
  );
}

/**
 * Row 7 — "Your app" (04 §7.1). The standing is `payments`', said in the family's words:
 *
 *   deposit-paid → in motion, "deposit taken" — the deposit opens **nothing** (ADR-097), and the row must not
 *                  imply it did; what it says is that the place is held.
 *   placed       → in motion or done: the app is on from the nanny's first day, before any bill (ADR-093 /
 *                  094), and the one date it carries is when the amount falls due.
 *   trial        → in motion, "Your app is open" — **no day count** (the ruling above).
 *   active · paid-in-full → done.
 *   toggled      → follows `open`, because an admin toggle overrides every other standing in both directions.
 *   lapsed · none → pending.
 */
function rowSeven(app: AppRailFacts | undefined, label: string): JourneyStep {
  if (app === undefined) return step(7, label, "pending");
  switch (app.standing) {
    case "deposit-paid":
      return step(
        7,
        label,
        "in-motion",
        "We're holding your place — your app switches on the day your nanny starts",
      );
    case "placed":
      return step(
        7,
        label,
        "in-motion",
        app.paymentDueAt === undefined
          ? "Your app is on"
          : `Your app is on — the amount falls due ${londonDate(app.paymentDueAt.slice(0, 10))}`,
      );
    case "trial":
      return step(7, label, "in-motion", "Your app is open");
    case "active":
    case "paid-in-full":
      return step(7, label, "done", "Your app is open");
    case "toggled":
      return app.open
        ? step(7, label, "done", "Your app is open")
        : step(7, label, "pending");
    default:
      return step(7, label, "pending");
  }
}

/**
 * Row 8 — "App — family + nanny in" (04 §7.1, §7.2). Three facts, three states, and the "after" wording is
 * 04 §7.1's own. A family with no child yet is `pending` rather than absent: 04 §7.1's rule is that a step is
 * never hidden and never reads as a room it is waiting in.
 */
function rowEight(app: AppRailFacts | undefined, label: string): JourneyStep {
  const link = app?.link;
  if (link === undefined || !link.hasChild) return step(8, label, "pending");
  if (link.nannyLinked)
    return step(8, label, "done", "Your app — family and nanny in");
  if (link.invitePending)
    return step(8, label, "in-motion", "Your nanny's link is out");
  return step(8, label, "in-motion", "Share your app with your nanny");
}

export function journeyRows4to8(input: {
  readonly connections: ReadonlyArray<ConnectionSummary>;
  readonly placement: PlacementRead | null;
  readonly app?: AppRailFacts;
  readonly labels: Readonly<{ meetings: string; hire: string; app: string }>;
}): ReadonlyArray<JourneyStep> {
  return Object.freeze([
    rowFour(input.connections, input.labels.meetings),
    rowFive(input.connections, input.labels.meetings),
    rowSix(input.placement, input.connections, input.labels.hire),
    rowSeven(input.app, input.labels.app),
    rowEight(input.app, input.labels.app),
  ]);
}
