// 04 §6.2 S-P-08 — the states one connection reads as, in a parent's words.
//
// The vocabulary rule is 04 §5.1 and glossary §6, and it bites here more than anywhere. 04 §6.2's fate line for
// S-P-08 replaces the Sydney word for a meeting with "meeting", so the stage `INTRO_SCHEDULED` reads
// **"Meeting arranged"**; and an admin-set time reads **"arranged by your matchmaker"**, which 04 §6.2 and §9
// both prescribe in those exact words. Nothing on the 05 §5.2 list appears in what a family reads here, and
// `connections.copy.test.ts` claims no allowlist row for this screen.
//
// The nanny's **name** is not here, for the reason `journey-rows-4-to-8.ts` gives: no connector puts a person
// behind these reads, and a raw id in front of a family is worse than no name. Pinned, not papered over.
import { LOCALE } from "@/modules/config";
import type { ConnectionStage } from "@/modules/shared-types";
import type { ConnectionSummary } from "../types";

export type ConnectionCard = {
  readonly connectionId: ConnectionSummary["connectionId"];
  /** the one-line state a parent reads */
  readonly state: string;
  /** what happens next, or what happened — never the enum */
  readonly detail?: string;
  /** `true` while the family still has something to do or wait for */
  readonly live: boolean;
  readonly meetingAt?: string;
};

const STATE_OF: Readonly<Record<ConnectionStage, string>> = Object.freeze({
  REQUEST_SENT: "Asked",
  NANNY_APPLIED: "She got in touch",
  ACCEPTED: "She's keen",
  INTRO_SCHEDULED: "Meeting arranged",
  INTRO_COMPLETE: "You've met",
  INTRO_INCOMPLETE: "The meeting didn't happen",
  AWAITING_RESPONSE: "You've met",
  TRIAL_ARRANGED: "Trial arranged",
  TRIAL_COMPLETE: "Trial done",
  OFFERED: "Going ahead",
  CONFIRMED: "Hired",
  ACTIVE: "With your family",
  FINISHED: "Finished",
  NOT_HIRED: "Not this time",
  NOT_SELECTED: "You went with someone else",
  DECLINED: "She's not available",
  REQUEST_EXPIRED: "No reply",
  SCHEDULE_EXPIRED: "No time was set",
  REQUEST_CANCELLED: "You withdrew",
  CANCELLED_BY_PARENT: "You withdrew",
  CANCELLED_BY_NANNY: "She withdrew",
});

const TERMINAL: ReadonlySet<ConnectionStage> = new Set([
  "FINISHED",
  "NOT_HIRED",
  "NOT_SELECTED",
  "DECLINED",
  "REQUEST_EXPIRED",
  "SCHEDULE_EXPIRED",
  "REQUEST_CANCELLED",
  "CANCELLED_BY_PARENT",
  "CANCELLED_BY_NANNY",
]);

const londonWhen = (instant: string): string => {
  const when = new Date(instant);
  const day = new Intl.DateTimeFormat(LOCALE.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
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
};

function detailOf(row: ConnectionSummary): string | undefined {
  if (row.stage === "ACCEPTED") return "Pick a time to meet";
  if (row.stage === "SCHEDULE_EXPIRED") return "Pick a time to meet";
  if (row.stage === "INTRO_COMPLETE" || row.stage === "AWAITING_RESPONSE")
    return "How did it go?";
  if (row.stage === "TRIAL_ARRANGED" && row.trialDate !== undefined)
    return `Trial on ${row.trialDate}`;
  if (row.meetingAt === undefined) return undefined;
  const when = londonWhen(row.meetingAt);
  // 04 §6.2 / §9: an admin-set time is shown as arranged by the matchmaker, in those words.
  return row.meetingSetBy === "admin"
    ? `${when} — arranged by your matchmaker`
    : when;
}

export function connectionCardView(row: ConnectionSummary): ConnectionCard {
  return Object.freeze({
    connectionId: row.connectionId,
    state: STATE_OF[row.stage],
    live: !TERMINAL.has(row.stage),
    ...(detailOf(row) === undefined ? {} : { detail: detailOf(row) }),
    ...(row.meetingAt === undefined ? {} : { meetingAt: row.meetingAt }),
  });
}
