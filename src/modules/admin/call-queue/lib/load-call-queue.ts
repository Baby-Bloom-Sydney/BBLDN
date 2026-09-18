// S-A-03's read (04 §6.4). One `scheduling.listSchedule` over the booking horizon, decorated per row from the
// `positions` connector — 03 §3.6 in terms: "`scheduling` returns ids, `admin` decorates".
//
// Authority is checked twice on purpose (07 §5.4 row 1): the route gates before it renders, and
// `scheduling.listSchedule` gates again on the session inside. This function passes the admin `Actor` through
// because the connector's signature asks for one; it is not what grants anything.
import { SCHEDULING } from "@/modules/config";
import { log } from "@/modules/platform";
import { positions } from "@/modules/positions";
import { scheduling } from "@/modules/scheduling";
import { callLayer, londonSlotWords } from "@/modules/call-layer";
import { connections } from "@/modules/connections";
import type {
  Actor,
  CallListItem,
  ISO,
  PositionId,
  UserId,
} from "@/modules/shared-types";
import type {
  AwaitingCallRow,
  CallQueueGroup,
  CallQueueRead,
  CallQueueRow,
} from "../types";
import { callStateOf } from "./call-state-of";
import { queueGroupOf } from "./queue-group-of";
import { QUEUE_HEADINGS } from "./queue-headings";

const DAY_MS = 86_400_000;
/** The list looks a little way back as well as forward: an overdue call is behind `now`, not in front of it. */
const LOOK_BACK_DAYS = 7;

/**
 * Kickoff debt 2 (04 §7.1 `{nanny}`) — `1f` shipped this line with a raw uuid on it, because `admin` may not read
 * a table (fix: A-11 / A-24) and no connector answered a person by id. `connections.nannyNameOf` is that method
 * now: one `nanny_public` read, injected into `connections` at boot, and `admin` already imports `connections`.
 *
 * A refusal or a nanny the view has no row for (isolated, below the pool) falls back to the id's **short form**,
 * the shape `admin-verification.nannyNameOf` already uses for the same case — never the whole identifier.
 */
const SHORT = 8;

async function aboutNanny(nannyId: UserId): Promise<string> {
  const read = await connections.nannyNameOf(nannyId as string as never);
  const name =
    read.ok && read.value !== null
      ? read.value
      : `nanny ${(nannyId as string).slice(0, SHORT)}`;
  return `Nanny commission call · ${name}`;
}

async function decorate(item: CallListItem): Promise<CallQueueRow> {
  const words = londonSlotWords(item.booking.start);
  const shared = {
    bookingId: item.booking.id,
    type: item.booking.kind,
    priority: item.booking.priority,
    state: callStateOf(item),
    startsAt: item.booking.start,
    when: words.full,
    group: queueGroupOf(item),
    flags: item.flags,
    ...(item.booking.outcome === undefined
      ? {}
      : { outcome: item.booking.outcome }),
  };
  if (item.booking.subject.kind === "nanny") {
    const nannyId = item.booking.subject.nannyId;
    return Object.freeze({
      ...shared,
      subject: { kind: "nanny" as const, nannyId },
      about: await aboutNanny(nannyId),
    });
  }
  const positionId: PositionId = item.booking.subject.positionId;
  // The one decoration the connectors can answer today. The family's **name** has no road: `admin` may not read
  // a table (fix: A-11 / A-24) and neither `auth` nor `positions` exposes a person by id — recorded, pinned.
  const about = await aboutPosition(positionId);
  const read = await positions.getForMatching(positionId);
  return Object.freeze({
    ...shared,
    subject: { kind: "position" as const, positionId },
    about,
    ...(read.ok ? { parentId: read.value.parentId as string as UserId } : {}),
  });
}

/** The position decoration both row kinds share — the one thing the connectors can answer (fix: A-11 / A-24). */
async function aboutPosition(positionId: PositionId): Promise<string> {
  const read = await positions.getForMatching(positionId);
  return read.ok
    ? `${read.value.district} · position ${read.value.stage.toLowerCase()}`
    : "Position details unavailable";
}

/**
 * 03 §3.6's other half: the calls that have never had a booking. `call-layer` enumerates them (`listOpenCalls`,
 * `1g`) and this decorates, exactly as it does for a booked row. A call that already points at a booking is
 * dropped here — `scheduling.listSchedule` has already returned it, and a family must not appear twice.
 */
async function awaitingRows(): Promise<ReadonlyArray<AwaitingCallRow>> {
  const open = await callLayer.listOpenCalls();
  if (!open.ok) {
    // ★ REVIEW-2 (silent-failure HIGH). This used to return `[]` with no log, and `loadCallQueue` still
    // answered `kind: "queue"` with a `total` that counted only the booked half — a *smaller number that looks
    // real*. S-A-03 rendered normally with an empty "awaiting" section, so families who asked for a call were
    // never called and no signal existed anywhere. The sibling failure path below distinguishes `forbidden`
    // from `unavailable`; this one cannot, because the awaiting half is additive to a queue that has already
    // loaded — so an alert is the honest remedy rather than failing the whole screen.
    log.error(
      "call queue: the open-call list did not answer; awaiting half is empty",
      {
        module: "admin",
        action: "loadCallQueue",
        alert: "ALERT_PROVIDER_DOWN",
        surface: "S-A-03",
        reason: open.error.details?.reason ?? open.error.code,
      },
    );
    return Object.freeze([]);
  }
  const neverBooked = open.value.filter((call) => call.bookingId === null);
  const rows = await Promise.all(
    neverBooked.map(async (call) =>
      Object.freeze({
        positionId: call.positionId,
        parentId: call.parentId,
        type: call.type,
        requestedAt: call.requestedAt,
        requestedWhen: londonSlotWords(call.requestedAt).full,
        noAnswerCount: call.noAnswerCount,
        about: await aboutPosition(call.positionId),
        ...(call.aboutNanny === undefined
          ? {}
          : { aboutNanny: call.aboutNanny }),
      }),
    ),
  );
  return Object.freeze(rows);
}

export async function loadCallQueue(actor: Actor): Promise<CallQueueRead> {
  const now = new Date().toISOString() as ISO;
  const at = Date.parse(now);
  const listed = await scheduling.listSchedule(
    {
      from: new Date(at - LOOK_BACK_DAYS * DAY_MS).toISOString() as ISO,
      to: new Date(at + SCHEDULING.horizonDays * DAY_MS).toISOString() as ISO,
    },
    actor,
  );
  if (!listed.ok)
    return listed.error.code === "FORBIDDEN"
      ? { kind: "forbidden" }
      : { kind: "unavailable" };

  const [rows, awaiting] = await Promise.all([
    Promise.all(listed.value.map(decorate)),
    awaitingRows(),
  ]);
  const groups: ReadonlyArray<CallQueueGroup> = QUEUE_HEADINGS.map(
    ({ name, heading }) =>
      Object.freeze({
        name,
        heading,
        rows: Object.freeze(rows.filter((row) => row.group === name)),
      }),
  );
  return {
    kind: "queue",
    view: Object.freeze({
      groups: Object.freeze(groups),
      total: rows.length + awaiting.length,
      awaiting,
    }),
  };
}
