// The reads `positions`, `admin` and S-P-08 call (03 §7.5), over the store port.
//
// The two counting reads feed a decision that must fail *narrow* rather than wide: `liveNannyIdsForParent` is
// the exclusion `scoring` applies (a nanny already in front of this family is not a new match), and
// `liveCountForPosition` is what I-2's "position `CONNECTING` ⇔ ≥ 1 live connection" is checked against. A read
// that answered "none" from nowhere would widen a candidate set that should have been narrowed, which is why
// the unconfigured default refuses instead.
//
// `2d` adds the third kind: **a name** (kickoff debt 2; 04 §7.1 `{nanny}`). `nannyNameOf` is a port — 01 §2.3
// gives this module no arrow to `matching`, which owns the one `nanny_public` read — and `forParent` decorates
// each summary with it, one lookup per distinct nanny however many rows she holds. A refusal or an empty answer
// leaves the field off: the nameless line is what all three surfaces rendered before and is a correct fallback,
// where a raw id in front of a family would not be.
import { ok } from "@/modules/platform";
import type {
  NannyId,
  ParentId,
  PositionId,
  Result,
} from "@/modules/shared-types";
import type {
  ConnectionRecord,
  ConnectionsErrorDetails,
  ConnectionsReads,
  ConnectionsResult,
  ConnectionStore,
  ConnectionSummary,
  NannyNameReader,
} from "../types";
import { LIVE_STAGES } from "./live-stages";

/**
 * The store promises the port's `AppErrorDetails`; the connector promises `ConnectionsErrorDetails`. Closing
 * the union any harder here would mean this module naming another module's failure reasons in its own type —
 * the reading `matching` recorded for `MatchingResult` and `1e` for `positions`.
 */
const asConnections = <T>(result: Result<T>): ConnectionsResult<T> =>
  result as Result<T, ConnectionsErrorDetails>;

const summaryOf = (
  row: ConnectionRecord,
  firstName: string | null,
): ConnectionSummary =>
  Object.freeze({
    connectionId: row.connectionId,
    positionId: row.positionId,
    nannyId: row.nannyId,
    stage: row.stage,
    origin: row.origin,
    ...(row.meetingAt === undefined ? {} : { meetingAt: row.meetingAt }),
    ...(row.meetingSetBy === undefined
      ? {}
      : { meetingSetBy: row.meetingSetBy }),
    ...(row.meetingOutcome === undefined
      ? {}
      : { meetingOutcome: row.meetingOutcome }),
    ...(row.trialDate === undefined ? {} : { trialDate: row.trialDate }),
    ...(firstName === null ? {} : { nannyFirstName: firstName }),
  });

/** One lookup per distinct nanny; a refusal is a missing name, never a failed read of the family's own list. */
async function namesFor(
  rows: ReadonlyArray<ConnectionRecord>,
  read: NannyNameReader | undefined,
): Promise<ReadonlyMap<string, string>> {
  const found = new Map<string, string>();
  if (read === undefined) return found;
  const ids = [...new Set(rows.map((row) => row.nannyId as string))];
  await Promise.all(
    ids.map(async (id) => {
      const name = await read(id as NannyId);
      if (name.ok && name.value !== null) found.set(id, name.value);
    }),
  );
  return found;
}

async function liveNannyIds(
  store: ConnectionStore,
  parentId: ParentId,
): Promise<ConnectionsResult<ReadonlyArray<NannyId>>> {
  const rows = await store.forParent(parentId);
  if (!rows.ok) return asConnections(rows);
  const ids = rows.value
    .filter((row) => LIVE_STAGES.includes(row.stage))
    .map((row) => row.nannyId);
  // one nanny, one entry: a family can hold live rows on more than one position over time
  return ok(Object.freeze([...new Set<NannyId>(ids)]));
}

/**
 * `1g` — rows 4 / 5 of the rail and every state S-P-08 renders. Terminal rows travel too: 04 §6.2 lists
 * "declined / expired" as states of the screen, so filtering them out here would hide from a family what
 * happened to a nanny she asked for.
 */
async function parentSummaries(
  store: ConnectionStore,
  read: NannyNameReader | undefined,
  parentId: ParentId,
): Promise<ConnectionsResult<ReadonlyArray<ConnectionSummary>>> {
  const rows = await store.forParent(parentId);
  if (!rows.ok) return asConnections(rows);
  const names = await namesFor(rows.value, read);
  return ok(
    Object.freeze(
      rows.value.map((row) =>
        summaryOf(row, names.get(row.nannyId as string) ?? null),
      ),
    ),
  );
}

async function liveCount(
  store: ConnectionStore,
  positionId: PositionId,
): Promise<ConnectionsResult<number>> {
  const rows = await store.forPosition(positionId);
  if (!rows.ok) return asConnections(rows);
  return ok(rows.value.filter((row) => LIVE_STAGES.includes(row.stage)).length);
}

export function createConnections(deps: {
  readonly store: ConnectionStore;
  readonly nannyNameOf?: NannyNameReader;
}): ConnectionsReads {
  return Object.freeze({
    liveNannyIdsForParent: (parentId: ParentId) =>
      liveNannyIds(deps.store, parentId),
    forParent: (parentId: ParentId) =>
      parentSummaries(deps.store, deps.nannyNameOf, parentId),
    nannyNameOf: async (nannyId: NannyId) =>
      deps.nannyNameOf === undefined
        ? ok(null)
        : asConnections(await deps.nannyNameOf(nannyId)),
    liveCountForPosition: (positionId: PositionId) =>
      liveCount(deps.store, positionId),
  });
}
