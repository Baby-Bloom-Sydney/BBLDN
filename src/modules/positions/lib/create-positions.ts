// 03 §2.5 — the read half of the stage-model connector over the store port, plus the two methods `matching`
// calls (03 §7.4). Pure reads: no lazy sweep, no expiry, no write except the two the contract names —
// `amend` (facts without a transition) and `recordPrecheck` (the autofire lever).
//
// `getJourneySteps` is keyed by `ParentId` (03 §2.5 `JourneyOwner`) and the store is asked for that parent's
// positions; `1d` passes the session's `UserId` through in one place (`loadParentJourney`) and that seam is
// still open — recorded in the `1e` PROGRESS entry, not silently resolved here.
import {
  Events,
  err,
  nowInstant,
  ok,
  withUnitOfWork,
} from "@/modules/platform";
import type {
  Actor,
  EntityRef,
  JourneyStep,
  ParentId,
  PositionId,
  Result,
  TransitionId,
} from "@/modules/shared-types";
import type {
  JourneyRowSource,
  PositionRecord,
  PositionStore,
  PositionsReads,
  PrecheckRecord,
} from "../types";
import { journeySteps } from "./journey-steps";
import { POSITION_TRANSITIONS } from "./position-transitions";
import { allowedTransitions } from "./allowed-transitions";

export type PositionsDeps = {
  readonly store: PositionStore;
  /** Row 3 of the rail, composed by `call-layer` and handed in at boot (see `JourneyRowSource`). */
  readonly rows?: JourneyRowSource;
};

const notFound = () =>
  err("NOT_FOUND", "No such position", {
    reason: "E_ENTITY_NOT_FOUND" as const,
    entity: "position" as const,
  });

const positionEntity = (entity: EntityRef): Result<PositionId> =>
  entity.kind === "position"
    ? ok(entity.id)
    : err("VALIDATION", "That entity is not a position", {
        reason: "E_TRANSITION_UNKNOWN" as const,
        entity: entity.kind,
      });

export function createPositions(deps: PositionsDeps): PositionsReads {
  const read = async (entity: EntityRef): Promise<Result<PositionRecord>> => {
    const id = positionEntity(entity);
    if (!id.ok) return id;
    const found = await deps.store.get(id.value);
    if (!found.ok) return found;
    return found.value === null ? notFound() : ok(found.value);
  };

  const liveFor = async (
    parentId: ParentId,
  ): Promise<Result<PositionRecord | null>> => {
    const live = await deps.store.liveForParent(parentId);
    if (!live.ok || live.value !== null) return live;
    const all = await deps.store.listForParent(parentId);
    if (!all.ok) return all;
    // no live position: the rail still has to describe the last one (04 §7.1 row 9 replaces rows 1–8).
    return ok(all.value[all.value.length - 1] ?? null);
  };

  const reads: PositionsReads = {
    amend: async (input) => {
      const current = await read(input.entity);
      if (!current.ok) return current;
      const next: PositionRecord = {
        ...current.value,
        version: current.value.version + 1,
      };
      return withUnitOfWork(async (uow) => {
        const written = await deps.store.put(next, uow);
        if (!written.ok) return written;
        const emitted = await Events.emit(
          {
            name: "position.amended",
            actor: input.actor,
            subject: input.entity,
            positionId: next.positionId,
            props: {
              fields: Object.keys(input.fields),
              version: next.version,
            },
            idempotencyKey: input.idempotencyKey,
          },
          { uow },
        );
        if (!emitted.ok) return emitted;
        return ok({
          entity: input.entity,
          stage: next.stage,
          version: next.version,
          changedAt: nowInstant(),
          cascaded: Object.freeze([]),
          events: Object.freeze(["position.amended" as const]),
        });
      });
    },

    getStage: async (entity) => {
      const current = await read(entity);
      if (!current.ok) return current;
      return ok({
        stage: current.value.stage,
        version: current.value.version,
        since: current.value.createdAt,
      });
    },

    getJourneySteps: async (
      parentId: ParentId,
    ): Promise<Result<ReadonlyArray<JourneyStep>>> => {
      const record = await liveFor(parentId);
      if (!record.ok) return record;
      const callRow =
        record.value === null || deps.rows === undefined
          ? null
          : await deps.rows.callRow(record.value.positionId);
      if (callRow !== null && !callRow.ok) return callRow;
      return ok(
        journeySteps(record.value, callRow === null ? null : callRow.value),
      );
    },

    listAllowed: async (
      entity: EntityRef,
      actor: Actor,
    ): Promise<ReadonlyArray<TransitionId>> => {
      const current = await read(entity);
      if (!current.ok) return Object.freeze([]);
      return allowedTransitions(
        POSITION_TRANSITIONS,
        current.value.stage,
        actor,
        current.value.parentId,
      );
    },

    getForMatching: async (positionId: PositionId) => {
      const found = await deps.store.get(positionId);
      if (!found.ok) return found;
      if (found.value === null) return notFound();
      return ok({
        positionId,
        parentId: found.value.parentId,
        stage: found.value.stage,
        district: found.value.detail.area.district,
        // `1g` fills this from the `connections` connector (03 §7.5); with no connections module inside, the
        // honest answer is "none known", and the exclusion it feeds is re-checked by `scoring` anyway.
        activeConnectionNannyIds: Object.freeze([]),
        detail: found.value.detail,
      });
    },

    recordPrecheck: async (positionId: PositionId, record: PrecheckRecord) => {
      const found = await deps.store.get(positionId);
      if (!found.ok) return found;
      if (found.value === null) return notFound();
      const next: PositionRecord = {
        ...found.value,
        precheck: record,
        version: found.value.version + 1,
      };
      const written = await withUnitOfWork((uow) => deps.store.put(next, uow));
      return written.ok ? ok(undefined) : written;
    },
  };
  return Object.freeze(reads);
}
