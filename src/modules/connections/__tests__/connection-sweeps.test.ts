// `4d` — the three connection sweeps of 01 §4f, proved by running them (`ecc-lite` rule 2).
//
// A test that asserted the cron shell passes a handler would be worth almost nothing: the thing that can be
// wrong here is the **boundary** — which rows a sweep believes are due — and the way that goes wrong in
// production is silently, one row at a time, in a direction nobody looks at. So every sweep is driven with two
// seeded rows, one on each side of its boundary, through the real K row and the real stage model:
//
//   the due row moved · the not-yet-due row did not · a second fire is a no-op.
//
// The dispatcher is the suite's own, for the reason `connections.inside.test.ts` gives: this module has no arrow
// to `positions` (01 §2.3), so it cannot import `advance`, and building the one thing `advance` is makes the
// claim stronger — the sweep works against any conforming dispatcher, which is what the injected `AdvanceFn`
// promises.
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
import type { Comms } from "@/modules/comms";
import {
  connectionSweepTargets,
  connectionsSliceRegistration,
  createConnectionsJobs,
  createConnectionsSlice,
  memoryConnectionStore,
  SWEPT_STAGES,
} from "@/modules/connections";
import type {
  ConnectionJobName,
  ConnectionRecord,
  ConnectionStore,
} from "@/modules/connections";
import type {
  AdvanceInput,
  ConnectionId,
  Email,
  Instant,
  ISODate,
  NannyId,
  ParentId,
  PositionId,
  TransitionHandler,
  TransitionId,
} from "@/modules/shared-types";

const POSITION = "00000000-0000-4000-8000-0000000000p1" as PositionId;
const PARENT = "00000000-0000-4000-8000-0000000000a1" as ParentId;
const NANNY = "00000000-0000-4000-8000-0000000000n1" as NannyId;
const DUE = "00000000-0000-4000-8000-0000000000c1" as ConnectionId;
const NOT_DUE = "00000000-0000-4000-8000-0000000000c2" as ConnectionId;

/** 15 July 2026, 04:00 London — BST, so 03:00Z. The instant `4b`'s gate delivers a 04:00 daily sweep at. */
const NOW = "2026-07-15T03:00:00.000Z" as Instant;
const LONDON_TODAY = "2026-07-15" as ISODate;

const stubComms = (): Comms =>
  ({
    send: async () => ok("m1" as never),
    sendMany: async () => ok([]),
    schedule: async () => ok("m1" as never),
    cancel: async () => ok({ cancelled: 0 }),
    status: async () => ok({ status: "sent" as const }),
    createInboxMessage: async () => ok({ id: "i1" as never }),
    notifyAdmin: async () => ok({ id: "n-1" as never }),
  }) as unknown as Comms;

const connection = (over: Partial<ConnectionRecord>): ConnectionRecord =>
  Object.freeze({
    connectionId: DUE,
    positionId: POSITION,
    parentId: PARENT,
    nannyId: NANNY,
    stage: "REQUEST_SENT",
    origin: "parent_request",
    createdAt: NOW,
    version: 1,
    ...over,
  });

/**
 * The suite's `advance`: the P rows a K row cascades into are fakes (P-3 / P-4 are `1e`'s claim, not this
 * unit's), and every K row is the real one.
 */
function world(seed: ReadonlyArray<ConnectionRecord>) {
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));

  const handlers = new Map<TransitionId, TransitionHandler>();
  const register = (slice: {
    readonly handlers: ReadonlyArray<TransitionHandler>;
  }) => {
    for (const handler of slice.handlers) handlers.set(handler.id, handler);
  };
  const dispatch = async (input: AdvanceInput<TransitionId>) => {
    const handler = handlers.get(input.transition);
    if (handler === undefined)
      return err("INTERNAL", "No slice is registered for this transition", {
        reason: "E_SLICE_NOT_REGISTERED" as const,
      });
    if (input.uow !== undefined) return handler.run(input, input.uow);
    return withUnitOfWork((uow) => handler.run(input, uow));
  };

  for (const id of ["P-3", "P-4", "P-5", "P-6", "P-7"] as const)
    handlers.set(id, {
      id,
      run: async (input) =>
        ok({
          entity: input.entity,
          stage: "OPEN" as const,
          version: 2,
          changedAt: NOW,
          cascaded: [],
          events: [],
        }),
    });

  const store: ConnectionStore = memoryConnectionStore(seed);
  register(
    connectionsSliceRegistration(
      createConnectionsSlice({
        store,
        advance: dispatch,
        comms: stubComms(),
        clock: () => NOW,
        positionFacts: async () =>
          ok({ stage: "CONNECTING", parentId: PARENT }),
        nannyFacts: async () =>
          ok({ verificationLevel: "L4_FULLY_VERIFIED", isolated: false }),
        recipientOf: async () => ok({ email: "family@example.test" as Email }),
      }),
    ),
  );
  const jobs = createConnectionsJobs({ store, advance: dispatch });
  const stageOf = async (id: ConnectionId) => {
    const read = await store.get(id);
    return read.ok ? (read.value?.stage ?? null) : "READ-FAILED";
  };
  return { store, jobs, stageOf };
}

/** The shape every one of the three is held to: due moves, not-due does not, twice is once. */
async function bothSidesOfTheBoundary(
  job: ConnectionJobName,
  seed: ReadonlyArray<ConnectionRecord>,
  expected: string,
  stillAt: string,
) {
  const w = world(seed);

  const first = await w.jobs.run(job, NOW);
  expect(first.ok && first.value).toEqual({ handled: 1, skipped: 0 });
  expect(await w.stageOf(DUE)).toBe(expected);
  expect(await w.stageOf(NOT_DUE)).toBe(stillAt);

  // A second fire in the same minute: the moved row is no longer at the stage the job selects on, so the
  // cohort is empty and nothing is written twice. Nothing durable records that the first run happened.
  const second = await w.jobs.run(job, NOW);
  expect(second.ok && second.value).toEqual({ handled: 0, skipped: 0 });
  expect(await w.stageOf(DUE)).toBe(expected);
  expect(await w.stageOf(NOT_DUE)).toBe(stillAt);
}

describe("expire-connections — K-8, a request nobody answered inside the window", () => {
  // CONNECTIONS.requestWindowHours is 72: a request made 73 hours ago is out, one made 71 hours ago is not.
  const sent = (hoursAgo: number, over: Partial<ConnectionRecord>) =>
    connection({
      createdAt: new Date(
        Date.parse(NOW as string) - hoursAgo * 3_600_000,
      ).toISOString() as Instant,
      ...over,
    });

  it("expires the request past its window and leaves the one still inside it", async () => {
    await bothSidesOfTheBoundary(
      "expire-connections",
      [
        sent(73, { connectionId: DUE, stage: "REQUEST_SENT" }),
        sent(71, { connectionId: NOT_DUE, stage: "REQUEST_SENT" }),
      ],
      "REQUEST_EXPIRED",
      "REQUEST_SENT",
    );
  });

  it("sweeps a nanny's application by the same window — K-8 names both stages", async () => {
    await bothSidesOfTheBoundary(
      "expire-connections",
      [
        sent(96, { connectionId: DUE, stage: "NANNY_APPLIED" }),
        sent(1, { connectionId: NOT_DUE, stage: "NANNY_APPLIED" }),
      ],
      "REQUEST_EXPIRED",
      "NANNY_APPLIED",
    );
  });

  it("believes a row that names its own deadline over the derived one", () => {
    const rows = [
      // created a minute ago — nowhere near the 72-hour window — but carrying a deadline that has passed
      sent(0.02, { connectionId: DUE, expiresAt: NOW }),
    ];
    expect(
      connectionSweepTargets(
        "expire-connections",
        rows,
        new Date(Date.parse(NOW as string) + 1000).toISOString() as Instant,
        LONDON_TODAY,
      ),
    ).toHaveLength(1);
  });

  it("leaves an accepted connection alone — K-10 is not swept, and the pin below says why", async () => {
    const w = world([
      sent(400, { connectionId: DUE, stage: "ACCEPTED" }),
      sent(400, { connectionId: NOT_DUE, stage: "REQUEST_SENT" }),
    ]);

    const run = await w.jobs.run("expire-connections", NOW);

    expect(run.ok && run.value.handled).toBe(1);
    expect(await w.stageOf(DUE)).toBe("ACCEPTED");
    expect(await w.stageOf(NOT_DUE)).toBe("REQUEST_EXPIRED");
  });
});

describe("meeting-complete-sweep — K-12, an introduction whose time has passed", () => {
  const scheduled = (minutesAgo: number, id: ConnectionId) =>
    connection({
      connectionId: id,
      stage: "INTRO_SCHEDULED",
      meetingAt: new Date(
        Date.parse(NOW as string) - minutesAgo * 60_000,
      ).toISOString() as Instant,
    });

  it("completes the meeting that has happened and not the one still ahead", async () => {
    await bothSidesOfTheBoundary(
      "meeting-complete-sweep",
      [scheduled(1, DUE), scheduled(-1, NOT_DUE)],
      "INTRO_COMPLETE",
      "INTRO_SCHEDULED",
    );
  });

  it("never completes a scheduled row with no meeting time — that is K-9 unfinished, not a meeting that ran", async () => {
    const w = world([
      connection({ connectionId: DUE, stage: "INTRO_SCHEDULED" }),
    ]);

    const run = await w.jobs.run("meeting-complete-sweep", NOW);

    expect(run.ok && run.value).toEqual({ handled: 0, skipped: 0 });
    expect(await w.stageOf(DUE)).toBe("INTRO_SCHEDULED");
  });
});

describe("trial-complete-sweep — K-16, a trial whose date is behind London", () => {
  const arranged = (date: string, id: ConnectionId) =>
    connection({
      connectionId: id,
      stage: "TRIAL_ARRANGED",
      trialDate: date as ISODate,
    });

  it("completes yesterday's trial and leaves today's — the job runs at 04:00, and today's trial has not run yet", async () => {
    await bothSidesOfTheBoundary(
      "trial-complete-sweep",
      [arranged("2026-07-14", DUE), arranged("2026-07-15", NOT_DUE)],
      "TRIAL_COMPLETE",
      "TRIAL_ARRANGED",
    );
  });

  // ★ The boundary is the **London** date, and in BST those two dates differ for an hour every night. At
  // 23:30Z the UTC date is still the 14th while London has been on the 15th for half an hour — so a trial dated
  // the 14th is complete in London and is not complete in UTC. A sweep that read `now.toISOString().slice(0,10)`
  // would pass every other test in this file and be a day out for seven months of the year; this is the case
  // that catches it, and it is driven through the job rather than the rule so it holds the derivation too.
  it("derives today from the London clock, not the UTC one — they disagree every BST night", async () => {
    const lateEvening = "2026-07-14T23:30:00.000Z" as Instant; // 00:30 on the 15th, London
    const w = world([arranged("2026-07-14", DUE)]);

    const run = await w.jobs.run("trial-complete-sweep", lateEvening);

    expect(run.ok && run.value).toEqual({ handled: 1, skipped: 0 });
    expect(await w.stageOf(DUE)).toBe("TRIAL_COMPLETE");
  });

  it("holds the same boundary in GMT, where the two dates agree", () => {
    const rows = [arranged("2026-01-14", DUE), arranged("2026-01-15", NOT_DUE)];
    const winter = "2026-01-15T04:00:00.000Z" as Instant;

    expect(
      connectionSweepTargets(
        "trial-complete-sweep",
        rows,
        winter,
        "2026-01-15" as ISODate,
      ).map((target) => target.row.connectionId),
    ).toEqual([DUE]);
  });
});

describe("what each sweep reads, and the one it does not", () => {
  it("selects on the stage its row moves a row out of — which is what makes the second fire a no-op", () => {
    expect(SWEPT_STAGES["expire-connections"]).toEqual([
      "REQUEST_SENT",
      "NANNY_APPLIED",
    ]);
    expect(SWEPT_STAGES["meeting-complete-sweep"]).toEqual(["INTRO_SCHEDULED"]);
    expect(SWEPT_STAGES["trial-complete-sweep"]).toEqual(["TRIAL_ARRANGED"]);
  });

  // ★ PIN — K-10 (`ACCEPTED → SCHEDULE_EXPIRED` after `CONNECTIONS.scheduleWindowDays`, 03 §2.4) is declared,
  // registered and tested, and it is still **not swept**, because the row has no column saying when it was
  // accepted. `0007` has `expires_at` and nothing writes it; `StepPayload` has no field for it. The only anchor
  // on the record is `createdAt`, which is when the request was *sent* — so a sweep built on it would expire a
  // live, accepted connection early by however long the request sat unanswered, in front of a family who did
  // nothing wrong. That is worse than not sweeping at all, which is why `4d` stopped rather than guessed.
  //
  // OWNER: whoever owns K-4 / K-5 (`connections`' accept rows) — stamp `expiresAt` at acceptance, or add
  // `acceptedAt` to `ConnectionRecord` and to `0007`'s mapping. The sweep is four lines once the anchor exists.
  it.fails(
    "K-10 sweeps an accepted connection past its scheduling window",
    async () => {
      const w = world([
        connection({
          connectionId: DUE,
          stage: "ACCEPTED",
          createdAt: "2026-01-01T00:00:00.000Z" as Instant,
        }),
      ]);

      await w.jobs.run("expire-connections", NOW);

      expect(await w.stageOf(DUE)).toBe("SCHEDULE_EXPIRED");
    },
  );
});
