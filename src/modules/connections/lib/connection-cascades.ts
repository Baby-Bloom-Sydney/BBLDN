// The cascades a K row fires (03 §2.4 "Side effects"), run **inside the originating `advance`** as
// `{ kind: 'system', id: 'cascade' }` and inside the same unit of work, so a row that half-commits is not a
// state this model can reach.
//
// Which cascades live here and why: `1e` put the P rows' own moves in `positions` and left the cascades that
// *arrive* at a P row — P-3, P-4, P-5 — with "their origin slice, which is also where their connection-side
// preconditions live". Those preconditions are the whole difficulty: P-3 fires only when this is the **first**
// connection to reach `ACCEPTED`, P-4 only when this was the **last** live one, P-5 only when exactly one is
// `CONFIRMED`. None of those can be answered from the position's row; all three are counts over this module's
// table.
//
// `connections` cannot call `advance` itself (01 §2.3 gives it no arrow to `positions` — the cycle R2 closed),
// so the dispatcher is the injected `AdvanceFn` the boot file hands in.
import { ok } from "@/modules/platform";
import type {
  Actor,
  ConnectionStage,
  PlacementId,
  Result,
  StateAfter,
  TransitionId,
  UnitOfWork,
} from "@/modules/shared-types";
import type { AdvanceFn, ConnectionRecord, ConnectionsDeps } from "../types";
import { LIVE_STAGES } from "./live-stages";

type Cascaded = StateAfter["cascaded"];

const CASCADE: Actor = Object.freeze({ kind: "system", id: "cascade" });

const isLive = (stage: ConnectionStage): boolean => LIVE_STAGES.includes(stage);

/** The siblings of `record` on the same position, `record` itself excluded — every count below is over these. */
const siblingsOf = (
  all: ReadonlyArray<ConnectionRecord>,
  record: ConnectionRecord,
): ReadonlyArray<ConnectionRecord> =>
  all.filter((each) => each.connectionId !== record.connectionId);

type Fire = {
  readonly advance: AdvanceFn;
  readonly key: string;
  readonly uow: UnitOfWork;
};

async function firePosition(
  fire: Fire,
  transition: "P-3" | "P-4" | "P-5",
  record: ConnectionRecord,
  expectedFrom: "OPEN" | "CONNECTING",
  payload: Readonly<Record<string, unknown>>,
): Promise<Result<Cascaded>> {
  const entity = { kind: "position" as const, id: record.positionId };
  const moved = await fire.advance({
    entity,
    transition,
    actor: CASCADE,
    payload,
    expectedFrom,
    idempotencyKey: `${fire.key}:${transition}`,
    uow: fire.uow,
  });
  if (!moved.ok) return moved;
  return ok([{ entity, transition, stage: moved.value.stage }]);
}

/**
 * K-2 / K-4 / K-5 → **P-3**, but only for the first one. 03 §2.4 P-3's precondition is "≥ 1 live connection
 * ≥ `ACCEPTED`" and its `from` is `OPEN`, so a second acceptance would be refused by `expectedFrom` anyway —
 * the count is checked here so the second acceptance is a clean success rather than a refusal the caller has
 * to interpret. I-2's "position `CONNECTING` ⇔ ≥ 1 live connection" is what both halves serve.
 */
async function toConnecting(
  fire: Fire,
  record: ConnectionRecord,
  siblings: ReadonlyArray<ConnectionRecord>,
  positionStage: string,
): Promise<Result<Cascaded>> {
  if (positionStage !== "OPEN") return ok([]);
  const alreadyConnecting = siblings.some(
    (each) =>
      isLive(each.stage) &&
      each.stage !== "REQUEST_SENT" &&
      each.stage !== "NANNY_APPLIED",
  );
  if (alreadyConnecting) return ok([]);
  return firePosition(fire, "P-3", record, "OPEN", {});
}

/**
 * K-8 / K-10 / K-18 / K-22 / K-24 → **P-4**, "cascade P-4 if last live". The position reopens only when this
 * termination left none behind; otherwise the family still has someone in motion and the rail must not fall
 * back a step.
 *
 * K-24's own row adds "**and not from P-7**": a position being closed is not a position being reopened, and
 * firing P-4 from inside P-7 would move `CLOSED` back to `OPEN` under the closer's feet.
 */
async function toReopened(
  fire: Fire,
  record: ConnectionRecord,
  siblings: ReadonlyArray<ConnectionRecord>,
  positionStage: string,
  fromPositionClose: boolean,
): Promise<Result<Cascaded>> {
  if (fromPositionClose || positionStage !== "CONNECTING") return ok([]);
  if (siblings.some((each) => isLive(each.stage))) return ok([]);
  return firePosition(fire, "P-4", record, "CONNECTING", {});
}

/**
 * K-20 → **P-5**, "exactly one connection `CONFIRMED`" (I-3). The confirmed row is `record` itself, so the
 * count that matters is that no sibling is also `CONFIRMED` / `ACTIVE` — which K-26 is about to make true by
 * moving them to `NOT_SELECTED`, and which the `0007` partial unique index enforces underneath.
 */
async function toActive(
  fire: Fire,
  record: ConnectionRecord,
  siblings: ReadonlyArray<ConnectionRecord>,
): Promise<Result<Cascaded>> {
  const otherFilled = siblings.filter(
    (each) => each.stage === "CONFIRMED" || each.stage === "ACTIVE",
  );
  if (otherFilled.length > 0) return ok([]);
  return firePosition(fire, "P-5", record, "CONNECTING", {
    filledByNannyId: record.nannyId,
  });
}

/** K-20 → **K-26** on every other live connection: "another nanny confirmed" (03 §2.2), one row each. */
async function notSelected(
  fire: Fire,
  siblings: ReadonlyArray<ConnectionRecord>,
): Promise<Result<Cascaded>> {
  const rows: Array<Cascaded[number]> = [];
  for (const sibling of siblings.filter((each) => isLive(each.stage))) {
    const entity = { kind: "connection" as const, id: sibling.connectionId };
    const moved = await fire.advance({
      entity,
      transition: "K-26",
      actor: CASCADE,
      payload: {},
      expectedFrom: sibling.stage,
      idempotencyKey: `${fire.key}:K-26:${sibling.connectionId}`,
      uow: fire.uow,
    });
    if (!moved.ok) return moved;
    rows.push({ entity, transition: "K-26", stage: moved.value.stage });
  }
  return ok(Object.freeze(rows));
}

/** K-20 → **L-1**: the placement is created by the cascade and emits `placement.confirmed`, never K-20. */
async function toPlacement(
  fire: Fire,
  record: ConnectionRecord,
  placementId: string,
): Promise<Result<Cascaded>> {
  const entity = {
    kind: "placement" as const,
    id: placementId as PlacementId,
  };
  const moved = await fire.advance({
    entity,
    transition: "L-1",
    actor: CASCADE,
    payload: {
      connectionId: record.connectionId,
      positionId: record.positionId,
      parentId: record.parentId,
      nannyId: record.nannyId,
      ...(record.terms === undefined ? {} : record.terms),
    },
    expectedFrom: null,
    idempotencyKey: `${fire.key}:L-1`,
    uow: fire.uow,
  });
  if (!moved.ok) return moved;
  return ok([
    { entity, transition: "L-1" as TransitionId, stage: moved.value.stage },
  ] as Cascaded);
}

const TERMINATES: ReadonlySet<string> = new Set([
  "K-8",
  "K-10",
  "K-18",
  "K-22",
  "K-24",
]);

const ACCEPTS: ReadonlySet<string> = new Set(["K-2", "K-4", "K-5"]);

export async function runCascades(input: {
  readonly deps: ConnectionsDeps;
  readonly id: TransitionId;
  readonly record: ConnectionRecord;
  readonly key: string;
  readonly uow: UnitOfWork;
  readonly positionStage: string;
  /** K-24's "and not from P-7" — true when the originating actor is the position-close cascade */
  readonly fromPositionClose: boolean;
  /** K-20's new placement id, minted by the slice so the cascade is pure */
  readonly placementId: string;
}): Promise<Result<Cascaded>> {
  const { deps, id, record, uow, key } = input;
  const all = await deps.store.forPosition(record.positionId);
  if (!all.ok) return all;
  const siblings = siblingsOf(all.value, record);
  const fire: Fire = { advance: deps.advance, key, uow };

  if (ACCEPTS.has(id))
    return toConnecting(fire, record, siblings, input.positionStage);
  if (TERMINATES.has(id))
    return toReopened(
      fire,
      record,
      siblings,
      input.positionStage,
      input.fromPositionClose,
    );
  if (id !== "K-20") return ok([]);

  // K-20 is the one row with three cascades, and 03 §2.4 calls them **atomic**: the placement, the position's
  // activation and the other nannies' `NOT_SELECTED` either all land or none do. They run in that order
  // because L-1's own invariant (I-3) is checked against a position the P-5 cascade is about to activate, and
  // `0007`'s deferred constraint trigger is what lets the two sit in one transaction.
  const placement = await toPlacement(fire, record, input.placementId);
  if (!placement.ok) return placement;
  const activated = await toActive(fire, record, siblings);
  if (!activated.ok) return activated;
  const dropped = await notSelected(fire, siblings);
  if (!dropped.ok) return dropped;
  return ok(
    Object.freeze([...placement.value, ...activated.value, ...dropped.value]),
  );
}
