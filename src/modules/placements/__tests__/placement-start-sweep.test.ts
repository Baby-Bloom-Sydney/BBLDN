// `4d` — `placement-start-sweep`, proved by running it (`ecc-lite` rule 2). The thing that can be wrong here is
// the **boundary**: which placements the sweep believes have started. So it is driven with two seeded rows, one
// each side of it, through the real L-1b:
//
//   the placement whose first day has arrived went ACTIVE and cascaded K-21 · the one starting tomorrow did
//   not · a second fire changed nothing.
//
// The dispatcher is the suite's own, for the reason `placements.inside.test.ts` gives: this module has no arrow
// to `positions` (01 §2.3), so it cannot import `advance` — it builds the one thing `advance` is.
import { describe, expect, it } from "vitest";
import {
  configureEvents,
  configureUnitOfWork,
  createEvents,
  createUnitOfWork,
  err,
  log,
  memoryEventLogStore,
  memoryTransactionOpener,
  ok,
  withUnitOfWork,
} from "@/modules/platform";
import {
  createPlacementsJobs,
  createPlacementsSlice,
  memoryPlacementStore,
  placementsSliceRegistration,
} from "@/modules/placements";
import type { PlacementRecord } from "@/modules/placements";
import type {
  AdvanceInput,
  ConnectionId,
  Instant,
  ISODate,
  NannyId,
  ParentId,
  PlacementId,
  PositionId,
  TransitionHandler,
  TransitionId,
} from "@/modules/shared-types";

const POSITION = "00000000-0000-4000-8000-0000000000p1" as PositionId;
const PARENT = "00000000-0000-4000-8000-0000000000a1" as ParentId;
const NANNY = "00000000-0000-4000-8000-0000000000n1" as NannyId;
const CONNECTION = "00000000-0000-4000-8000-0000000000c1" as ConnectionId;
const DUE = "00000000-0000-4000-8000-0000000000l1" as PlacementId;
const NOT_DUE = "00000000-0000-4000-8000-0000000000l2" as PlacementId;

/** 00:15 London on 15 July 2026 — BST, so 23:15Z on the **14th**. The instant `4b`'s gate delivers this at. */
const NOW = "2026-07-14T23:15:00.000Z" as Instant;

const record = (over: Partial<PlacementRecord>): PlacementRecord =>
  Object.freeze({
    placementId: DUE,
    positionId: POSITION,
    connectionId: CONNECTION,
    parentId: PARENT,
    nannyId: NANNY,
    source: "connection",
    state: "CONFIRMED",
    weeklyHours: 40,
    hourlyRatePence: 1800, // config-literal-ok: a placement fixture, not a price — PRICES owns real money
    startDate: "2026-07-15" as ISODate,
    createdAt: "2026-07-01T09:00:00.000Z" as Instant,
    version: 1,
    ...over,
  });

function world(seed: ReadonlyArray<PlacementRecord>) {
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));

  const fired: Array<TransitionId> = [];
  const handlers = new Map<TransitionId, TransitionHandler>();
  const dispatch = async (input: AdvanceInput<TransitionId>) => {
    const handler = handlers.get(input.transition);
    if (handler === undefined)
      return err("INTERNAL", "No slice is registered for this transition", {
        reason: "E_SLICE_NOT_REGISTERED" as const,
      });
    if (input.uow !== undefined) return handler.run(input, input.uow);
    return withUnitOfWork((uow) => handler.run(input, uow));
  };
  for (const id of ["K-21", "K-23", "P-6"] as ReadonlyArray<TransitionId>)
    handlers.set(id, {
      id,
      run: async (input) => {
        fired.push(id);
        return ok({
          entity: input.entity,
          stage: "ACTIVE" as const,
          version: 2,
          changedAt: NOW,
          cascaded: [],
          events: [],
        });
      },
    });

  const store = memoryPlacementStore(seed);
  const dfy: Array<string> = [];
  for (const handler of createPlacementsSlice({
    store,
    advance: dispatch,
    clock: () => NOW,
    openDfyAccess: async (input: { readonly placementId: PlacementId }) => {
      dfy.push(input.placementId as string);
      return ok(undefined);
    },
  }))
    handlers.set(handler.id, handler);
  // registered the same way boot does it, so the registration shape is exercised rather than bypassed
  expect(
    placementsSliceRegistration(
      createPlacementsSlice({ store, advance: dispatch, clock: () => NOW }),
    ).entity,
  ).toBe("placement");

  const jobs = createPlacementsJobs({ store, advance: dispatch });
  const stateOf = async (id: PlacementId) => {
    const read = await store.get(id);
    return read.ok ? (read.value?.state ?? null) : "READ-FAILED";
  };
  return { store, jobs, stateOf, fired, dfy };
}

describe("placement-start-sweep — L-1b, the nanny's first day", () => {
  it("starts the placement whose day has arrived and leaves the one starting tomorrow", async () => {
    const w = world([
      record({ placementId: DUE, startDate: "2026-07-15" as ISODate }),
      record({ placementId: NOT_DUE, startDate: "2026-07-16" as ISODate }),
    ]);

    const first = await w.jobs.runStartSweep(NOW);

    expect(first.ok && first.value).toEqual({ handled: 1, skipped: 0 });
    expect(await w.stateOf(DUE)).toBe("ACTIVE");
    expect(await w.stateOf(NOT_DUE)).toBe("CONFIRMED");
    // L-1b's own consequences, which a cron writing the table itself would have skipped in silence
    expect(w.fired).toContain("K-21");
    expect(w.dfy).toEqual([DUE as string]);

    const second = await w.jobs.runStartSweep(NOW);

    expect(second.ok && second.value).toEqual({ handled: 0, skipped: 0 });
    expect(await w.stateOf(DUE)).toBe("ACTIVE");
    expect(await w.stateOf(NOT_DUE)).toBe("CONFIRMED");
    expect(w.dfy).toEqual([DUE as string]);
  });

  // ★ 00:15 London is 23:15Z the previous day through BST, which is the single hour of the day when the UTC
  // date and the London date disagree — and it is the hour this job is scheduled for. A sweep reading the UTC
  // date would hold every placement back by a day for seven months a year, and pass a test written in GMT.
  it("reads the London date at 00:15 BST, when the UTC date is still yesterday", async () => {
    const w = world([record({ startDate: "2026-07-15" as ISODate })]);

    // 23:15Z on the 14th: UTC says the 14th, London says the 15th, and the placement starts on the 15th.
    expect(NOW.slice(0, 10)).toBe("2026-07-14");
    const run = await w.jobs.runStartSweep(NOW);

    expect(run.ok && run.value.handled).toBe(1);
    expect(await w.stateOf(DUE)).toBe("ACTIVE");
  });

  it("starts a placement whose day has already gone by — a missed run catches up, it does not skip", async () => {
    const w = world([record({ startDate: "2026-06-01" as ISODate })]);

    const run = await w.jobs.runStartSweep(NOW);

    expect(run.ok && run.value.handled).toBe(1);
    expect(await w.stateOf(DUE)).toBe("ACTIVE");
  });

  it("touches nothing that is not CONFIRMED — the cohort is the state L-1b moves a row out of", async () => {
    const w = world([
      record({ placementId: DUE, state: "ACTIVE" }),
      record({ placementId: NOT_DUE, state: "ENDED" }),
    ]);

    const run = await w.jobs.runStartSweep(NOW);

    expect(run.ok && run.value).toEqual({ handled: 0, skipped: 0 });
    expect(await w.stateOf(DUE)).toBe("ACTIVE");
    expect(await w.stateOf(NOT_DUE)).toBe("ENDED");
  });
});
