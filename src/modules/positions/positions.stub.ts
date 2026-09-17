// `stage-model.stub.ts` (03 §11 test 1) — the in-memory read half of the stage model: a `Map` of entity ref to
// `{ stage, version }`, seeded by the caller. It is **not** a stage machine: it moves nothing, because the 44
// rows of 03 §2.4 (preconditions, cascades, invariants, idempotency) are the slices' and are Phase 1e. Its job
// is to let every consumer of `positions.getStage` / `getJourneySteps` / `listAllowed` compile and run while the
// inside does not exist — which is the swap the L3 law asks for.
import { err, ok } from "@/modules/platform";
import type {
  EntityRef,
  Instant,
  JourneyStep,
  Stage,
  TransitionId,
} from "@/modules/shared-types";
import type {
  PositionForMatching,
  PositionSummary,
  PositionsReads,
} from "./types";

export type StubStageSeed = {
  readonly stages?: Readonly<Record<string, Stage>>;
  readonly journey?: ReadonlyArray<JourneyStep>;
  readonly allowed?: ReadonlyArray<TransitionId>;
  readonly forMatching?: PositionForMatching;
  readonly live?: PositionSummary;
};

const keyOf = (entity: EntityRef): string => `${entity.kind}:${entity.id}`;

export function stubPositions(seed: StubStageSeed = {}): PositionsReads {
  const stages = new Map(Object.entries(seed.stages ?? {}));
  const versions = new Map<string, number>();
  const since = "2026-01-01T00:00:00+00:00" as Instant;

  const readStage = (entity: EntityRef) => {
    const stage = stages.get(keyOf(entity));
    if (stage === undefined) {
      return err("NOT_FOUND", "Entity not found", {
        reason: "E_ENTITY_NOT_FOUND" as const,
        entity: entity.kind,
      });
    }
    return ok({
      stage,
      version: versions.get(keyOf(entity)) ?? 1,
      since,
    });
  };

  return Object.freeze({
    amend: async (input) => {
      const current = readStage(input.entity);
      if (!current.ok) return current;
      const key = keyOf(input.entity);
      const version = current.value.version + 1;
      versions.set(key, version);
      return ok({
        entity: input.entity,
        stage: current.value.stage,
        version,
        changedAt: since,
        cascaded: Object.freeze([]),
        events: Object.freeze([]),
      });
    },
    getStage: async (entity) => readStage(entity),
    getJourneySteps: async () => ok(seed.journey ?? Object.freeze([])),
    listAllowed: async () => seed.allowed ?? Object.freeze([]),
    getForMatching: async () =>
      seed.forMatching === undefined
        ? err("NOT_FOUND", "Position not found", {
            reason: "E_ENTITY_NOT_FOUND" as const,
            entity: "position" as const,
          })
        : ok(seed.forMatching),
    recordPrecheck: async () => ok(undefined),
    findLive: async () => ok(seed.live ?? null),
  });
}
