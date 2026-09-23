// `4d` — `close-no-candidates`, proved by running it (`ecc-lite` rule 2). This is the sweep with the most to
// get wrong, because everything it gets wrong it gets wrong by **closing a family's position**: it fires P-7,
// which cascades K-24 onto every live connection, closes the open call and sends `no-candidates-left`. So each
// of the three ways it could close one it should not is a seeded row here, against one it genuinely should:
//
//   the window ended with nobody keen → closed · the window has not ended → untouched · a keen nanny is
//   already there → untouched · no pre-check ever fired → untouched · the connections read failed → skipped,
//   never closed · and a second fire changes nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureEvents,
  configureUnitOfWork,
  createEvents,
  createUnitOfWork,
  log,
  memoryEventLogStore,
  memoryTransactionOpener,
  ok,
  err,
} from "@/modules/platform";
import { configureConnections } from "@/modules/connections";
import type { ConnectionsReads } from "@/modules/connections";
import {
  createPositionsJobs,
  createPositionsSlice,
  memoryPositionStore,
  registerPositionsSlice,
  registerSlice,
} from "@/modules/positions";
import type { PositionRecord } from "@/modules/positions";
import type {
  Instant,
  ISODate,
  ParentId,
  PositionId,
} from "@/modules/shared-types";

const DUE = "00000000-0000-4000-8000-0000000000p1" as PositionId;
const OTHER = "00000000-0000-4000-8000-0000000000p2" as PositionId;
const PARENT_A = "00000000-0000-4000-8000-0000000000a1" as ParentId;
const PARENT_B = "00000000-0000-4000-8000-0000000000a2" as ParentId;

/** 04:15 London on 15 July 2026 — BST, so 03:15Z. */
const NOW = "2026-07-15T03:15:00.000Z" as Instant;
const ENDED = "2026-07-14T09:00:00.000Z" as Instant; // the window closed yesterday
const STILL_OPEN = "2026-07-20T09:00:00.000Z" as Instant; // it closes next week

const detail = {
  area: { district: "SE15", postcode: "SE15 4TY" },
  schedule: null,
  children: [{ ageMonths: 18 }],
  startDate: "2026-08-01" as ISODate,
  weeklyHours: 40,
} as unknown as PositionRecord["detail"];

const position = (over: Partial<PositionRecord>): PositionRecord =>
  Object.freeze({
    positionId: DUE,
    parentId: PARENT_A,
    source: "results_signup",
    stage: "OPEN",
    detail,
    recipient: { email: "family@example.test", name: "Rina" },
    createdAt: "2026-07-01T09:00:00.000Z" as Instant,
    precheck: {
      firedAt: "2026-07-11T09:00:00.000Z" as Instant,
      expiresAt: ENDED,
      wave: 1,
    },
    version: 1,
    ...over,
  } as PositionRecord);

/** `liveCountForPosition` is the only `connections` read this sweep makes; the rest of the connector is unused. */
const connectionsAnswering = (
  answer: (
    positionId: PositionId,
  ) => ReturnType<ConnectionsReads["liveCountForPosition"]>,
): ConnectionsReads =>
  ({
    liveNannyIdsForParent: async () => ok(Object.freeze([])),
    liveCountForPosition: answer,
    forParent: async () => ok(Object.freeze([])),
    nannyNameOf: async () => ok(null),
  }) as unknown as ConnectionsReads;

function world(
  seed: ReadonlyArray<PositionRecord>,
  liveCount: (positionId: PositionId) => number | "fails" = () => 0,
) {
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  configureConnections(
    connectionsAnswering(async (positionId: PositionId) => {
      const answer = liveCount(positionId);
      return answer === "fails"
        ? err("INTERNAL", "the connections read is down", {
            reason: "connections-not-configured" as const,
          })
        : ok(answer);
    }),
  );

  const store = memoryPositionStore(seed);
  registerPositionsSlice(
    createPositionsSlice({ store, isInServiceArea: async () => true }),
  );
  // P-7 cascades into C-4 on the call mirror, which `call-layer` owns and `positions` may not import. Boot
  // registers the real slice; here a fake answers NOT_FOUND, which is the "there was no call to close"
  // answer `cascade()` tolerates — so the sweep is exercised against the cascade rather than around it.
  registerSlice({
    entity: "call",
    handlers: [
      {
        id: "C-4",
        run: async () =>
          err("NOT_FOUND", "no call mirror for this position", {
            reason: "E_ENTITY_NOT_FOUND" as const,
          }),
      },
    ],
  });
  const jobs = createPositionsJobs({ store });
  const stageOf = async (id: PositionId) => {
    const read = await store.get(id);
    return read.ok ? (read.value?.stage ?? null) : "READ-FAILED";
  };
  const reasonOf = async (id: PositionId) => {
    const read = await store.get(id);
    return read.ok ? (read.value?.closeReason ?? null) : null;
  };
  return { store, jobs, stageOf, reasonOf };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("close-no-candidates — P-7, the pre-check window that ended with nobody", () => {
  it("closes the position whose window ended with no live connection, and says why", async () => {
    const w = world([position({ positionId: DUE })]);

    const first = await w.jobs.runCloseNoCandidates(NOW);

    expect(first.ok && first.value).toEqual({ handled: 1, skipped: 0 });
    expect(await w.stageOf(DUE)).toBe("CLOSED");
    expect(await w.reasonOf(DUE)).toBe("no_candidates");

    const second = await w.jobs.runCloseNoCandidates(NOW);

    expect(second.ok && second.value).toEqual({ handled: 0, skipped: 0 });
    expect(await w.stageOf(DUE)).toBe("CLOSED");
  });

  it("leaves the position whose window has not ended yet", async () => {
    const w = world([
      position({ positionId: DUE }),
      position({
        positionId: OTHER,
        parentId: PARENT_B,
        precheck: {
          firedAt: "2026-07-14T09:00:00.000Z" as Instant,
          expiresAt: STILL_OPEN,
          wave: 1,
        },
      }),
    ]);

    const run = await w.jobs.runCloseNoCandidates(NOW);

    expect(run.ok && run.value).toEqual({ handled: 1, skipped: 0 });
    expect(await w.stageOf(DUE)).toBe("CLOSED");
    expect(await w.stageOf(OTHER)).toBe("OPEN");
  });

  // "with no keen nanny" — and a keen nanny is a live connection, which is the only form the data has one in.
  it("leaves the position that has a keen nanny on it, however long the window has been shut", async () => {
    const w = world(
      [
        position({ positionId: DUE }),
        position({ positionId: OTHER, parentId: PARENT_B }),
      ],
      (positionId) => (positionId === OTHER ? 1 : 0),
    );

    const run = await w.jobs.runCloseNoCandidates(NOW);

    expect(run.ok && run.value).toEqual({ handled: 1, skipped: 0 });
    expect(await w.stageOf(DUE)).toBe("CLOSED");
    expect(await w.stageOf(OTHER)).toBe("OPEN");
  });

  // ★ The worst of the three. A position with no lever has never been looked at; closing it would tell a
  // family we found nobody when we never went and asked. It is `dfy-waves`' to fire, not this job's to close.
  it("never closes a position that has had no pre-check at all", async () => {
    const w = world([position({ positionId: DUE, precheck: null })]);

    const run = await w.jobs.runCloseNoCandidates(NOW);

    expect(run.ok && run.value).toEqual({ handled: 0, skipped: 0 });
    expect(await w.stageOf(DUE)).toBe("OPEN");
  });

  // Fail closed: a position we cannot judge is skipped and counted, never closed on a database hiccup.
  it("skips rather than closes when the connections read is down", async () => {
    const w = world([position({ positionId: DUE })], () => "fails");

    const run = await w.jobs.runCloseNoCandidates(NOW);

    expect(run.ok && run.value).toEqual({ handled: 0, skipped: 1 });
    expect(await w.stageOf(DUE)).toBe("OPEN");
  });

  it("sweeps CONNECTING too — P-7's `from` includes it and a connection can go terminal", async () => {
    const w = world([position({ positionId: DUE, stage: "CONNECTING" })]);

    const run = await w.jobs.runCloseNoCandidates(NOW);

    expect(run.ok && run.value.handled).toBe(1);
    expect(await w.stageOf(DUE)).toBe("CLOSED");
  });

  it("touches no position outside P-7's `from` — an ACTIVE placement is ended, never closed", async () => {
    const w = world([position({ positionId: DUE, stage: "ACTIVE" })]);

    const run = await w.jobs.runCloseNoCandidates(NOW);

    expect(run.ok && run.value).toEqual({ handled: 0, skipped: 0 });
    expect(await w.stageOf(DUE)).toBe("ACTIVE");
  });
});
