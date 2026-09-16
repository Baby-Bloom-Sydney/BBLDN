// Swap test 1 (03 §11) — the acceptance for L3 on the stage model, in the shape this unit can prove: keep
// `index.ts` + `types.ts`, register a **stub slice** in place of `connections` / `placements` / `call-layer`, and
// `advance` still dispatches, still runs the slice inside one unit of work, and still refuses what it must.
//
// The 44-row table test (every `TransitionId` ↔ 03 §2.4, every side-effect `TemplateId`, every event name) is
// Phase 1e — `TRANSITIONS` does not exist yet; that gap is recorded in the L-005 F-a PROGRESS entry.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configureUnitOfWork,
  createUnitOfWork,
  memoryTransactionOpener,
  ok,
} from "@/modules/platform";
import {
  advance,
  configurePositions,
  positions,
  registerSlice,
  stubPositions,
} from "@/modules/positions";
import type { TransitionHandler } from "@/modules/positions";
import type {
  Actor,
  AdvanceInput,
  Instant,
  PositionId,
  TransitionId,
  UnitOfWork,
} from "@/modules/shared-types";
import { SLICE_REGISTRY } from "../lib/slice-registry";

const POSITION_ID = "position-1" as PositionId;
const ADMIN: Actor = Object.freeze({
  kind: "admin",
  id: "admin-1" as never,
});

const inputFor = (
  transition: TransitionId,
  uow?: UnitOfWork,
): AdvanceInput<TransitionId> =>
  Object.freeze({
    entity: { kind: "position" as const, id: POSITION_ID },
    transition,
    actor: ADMIN,
    payload: Object.freeze({}),
    expectedFrom: "OPEN" as const,
    idempotencyKey: `key-${transition}`,
    ...(uow === undefined ? {} : { uow }),
  });

/** A slice that records what it was handed — the "stub honouring index.ts" the swap test drops in. */
function recordingSlice(id: TransitionId) {
  const calls: Array<{ readonly uow: UnitOfWork }> = [];
  const handler: TransitionHandler = {
    id,
    run: async (input, uow) => {
      calls.push({ uow });
      return ok({
        entity: input.entity,
        stage: "CONNECTING" as const,
        version: 2,
        changedAt: "2026-01-01T00:00:00+00:00" as Instant,
        cascaded: [],
        events: [],
      });
    },
  };
  return { handler, calls };
}

beforeEach(() => {
  SLICE_REGISTRY.clear();
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configurePositions(stubPositions());
});

afterEach(() => {
  SLICE_REGISTRY.clear();
});

describe("registerSlice + advance — the dispatch seam", () => {
  it("dispatches a registered transition into its slice", async () => {
    const slice = recordingSlice("P-3");
    registerSlice({ entity: "position", handlers: [slice.handler] });

    const result = await advance(inputFor("P-3"));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.stage).toBe("CONNECTING");
    expect(slice.calls).toHaveLength(1);
  });

  it("opens a unit of work for the slice when the caller passed none", async () => {
    const slice = recordingSlice("P-3");
    registerSlice({ entity: "position", handlers: [slice.handler] });

    await advance(inputFor("P-3"));

    expect(slice.calls[0]?.uow).toBeDefined();
  });

  it("passes the caller's unit of work straight through", async () => {
    const slice = recordingSlice("P-3");
    registerSlice({ entity: "position", handlers: [slice.handler] });
    const callersUow = {} as UnitOfWork;

    await advance(inputFor("P-3", callersUow));

    expect(slice.calls[0]?.uow).toBe(callersUow);
  });

  it("rejects an unknown transition id as VALIDATION, not as a missing slice", async () => {
    const result = await advance(inputFor("NOT-A-TRANSITION" as TransitionId));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(!result.ok && result.error.details?.reason).toBe(
      "E_TRANSITION_UNKNOWN",
    );
  });

  it("reports a known transition with no slice as a boot defect, not a caller error", async () => {
    const result = await advance(inputFor("K-1"));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "E_SLICE_NOT_REGISTERED",
    );
  });

  it("lets a second registration replace a slice — the swap itself", async () => {
    const first = recordingSlice("K-1");
    const second = recordingSlice("K-1");
    registerSlice({ entity: "connection", handlers: [first.handler] });
    registerSlice({ entity: "connection", handlers: [second.handler] });

    await advance(inputFor("K-1"));

    expect(first.calls).toHaveLength(0);
    expect(second.calls).toHaveLength(1);
  });

  it("registers every handler a slice hands in", () => {
    registerSlice({
      entity: "placement",
      handlers: [
        recordingSlice("L-1").handler,
        recordingSlice("L-1b").handler,
        recordingSlice("L-2").handler,
      ],
    });

    expect(SLICE_REGISTRY.registered()).toEqual(["L-1", "L-1b", "L-2"]);
  });
});

describe("the read half, swapped for the stub", () => {
  it("fails closed before boot configures the reads", async () => {
    configurePositions(stubPositions());

    const result = await positions.getStage({
      kind: "position",
      id: POSITION_ID,
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });

  it("reads a seeded stage through the module binding", async () => {
    configurePositions(
      stubPositions({ stages: { [`position:${POSITION_ID}`]: "OPEN" } }),
    );

    const result = await positions.getStage({
      kind: "position",
      id: POSITION_ID,
    });

    expect(result.ok && result.value.stage).toBe("OPEN");
  });

  it("returns no levers rather than an invented one when nothing is configured", async () => {
    await expect(
      positions.listAllowed({ kind: "position", id: POSITION_ID }, ADMIN),
    ).resolves.toEqual([]);
  });

  it("bumps the version on amend without moving the stage", async () => {
    configurePositions(
      stubPositions({ stages: { [`position:${POSITION_ID}`]: "OPEN" } }),
    );

    const result = await positions.amend({
      entity: { kind: "position", id: POSITION_ID },
      actor: ADMIN,
      fields: { notes: "x" },
      idempotencyKey: "amend-1",
    });

    expect(result.ok && result.value.stage).toBe("OPEN");
    expect(result.ok && result.value.version).toBe(2);
  });
});
