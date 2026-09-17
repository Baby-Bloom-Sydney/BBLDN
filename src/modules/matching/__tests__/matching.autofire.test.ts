// 03 §7.4 — the pre-check, over the real `positions` inside and the `scoring` stub. The claim the merge rests
// on (ADR-123 keeps ADR-120 rule 1) is the one T-1.4 level 2 depends on: after a position opens, the lever is
// written, the ranking happened, and rail row 2 is in motion before anyone rings — so 04 §3.1 step 12's promise
// is not a sentence on a screen with nothing behind it.
import { beforeEach, describe, expect, it } from "vitest";
import { LOCALE, MATCHING } from "@/modules/config";
import { autofire } from "@/modules/matching";
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
} from "@/modules/platform";
import {
  advance,
  configurePositions,
  createPositions,
  createPositionsSlice,
  memoryPositionStore,
  positions,
  registerPositionsSlice,
  registerSlice,
} from "@/modules/positions";
import type { PositionMatchDetail, PositionStore } from "@/modules/positions";
import {
  configureScoring,
  stubDistanceProvider,
  stubScoring,
} from "@/modules/scoring";
import type { Candidate } from "@/modules/scoring";
import type {
  Actor,
  Email,
  EventName,
  Instant,
  NannyId,
  ParentId,
  PositionId,
  UserId,
} from "@/modules/shared-types";

const NOW = "2026-01-09T08:00:00.000Z" as Instant;
const POSITION = "0f1e2d3c-0000-4000-8000-0000000000d1" as PositionId;
const PARENT = "0a1b2c3d-0000-4000-8000-0000000000e1" as UserId;
const convert: Actor = { kind: "system", id: "signup-convert-lead" };

const DETAIL: PositionMatchDetail = Object.freeze({
  area: { area: "Islington", district: "N1" },
  schedule: { type: "Fixed", blocks: [{ day: 0, part: "morning" }] } as const,
  requirements: {
    childAgeMonths: [{ min: 12, max: 24 }],
    capacity: 1,
    specialNeeds: false,
    licence: false,
    car: false,
    vaccination: false,
    nonSmoker: false,
    pets: false,
    roleType: "",
  },
});

const candidate = (n: number): Candidate => ({
  nannyId:
    `0a1b2c3d-0000-4000-8000-00000000f${n.toString().padStart(3, "0")}` as NannyId,
  area: { area: "Islington", district: "N1" },
  availability: [{ day: 0, part: "morning" }],
  experienceYears: 3,
  qualificationRung: 2,
  certifications: [],
  hasCar: false,
  attributes: {},
  languages: [],
  verificationLevel: 4,
  isolated: false,
  silentHold: false,
  activeConnectionWithFamily: false,
});

const POOL: ReadonlyArray<Candidate> = Object.freeze(
  Array.from({ length: 3 }, (_, index) => candidate(index + 1)),
);

let store: PositionStore;
let emitted: EventName[];

const engine = () =>
  stubScoring({ distance: stubDistanceProvider(), config: MATCHING });

const fakeCallSlice = () =>
  (["C-a"] as const).map((id) => ({
    id,
    run: async () =>
      ok({
        entity: { kind: "call" as const, id: POSITION },
        stage: "awaiting-slot" as const,
        version: 1,
        changedAt: NOW,
        cascaded: [],
        events: [],
      }),
  }));

beforeEach(async () => {
  emitted = [];
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(
    createEvents({
      store: memoryEventLogStore(),
      log,
      sinks: [
        {
          id: "console",
          handle: async (envelope) => {
            emitted.push(envelope.name);
            return ok(undefined);
          },
        },
      ],
    }),
  );
  configureScoring(engine());
  store = memoryPositionStore();
  registerPositionsSlice(
    createPositionsSlice({
      store,
      isInServiceArea: async () => true,
      clock: () => NOW,
    }),
  );
  registerSlice({ entity: "call", handlers: fakeCallSlice() });
  configurePositions(createPositions({ store }));
  await advance({
    entity: { kind: "position", id: POSITION },
    transition: "P-2",
    actor: convert,
    payload: {
      parentId: PARENT as string as ParentId,
      source: "results_signup",
      detail: DETAIL,
      recipient: { email: "ada@example.test" as Email, name: "Ada" },
      mobile: `${LOCALE.phonePrefix}7700900123`,
    },
    expectedFrom: null,
    idempotencyKey: "open",
  });
});

const run = (entries: ReadonlyArray<Candidate> = POOL) =>
  autofire({ pool: async () => ok(entries), clock: () => NOW })(
    POSITION,
    convert,
  );

describe("autofire — the pre-check that makes the call promise level 2 (03 §7.4; T-1.4)", () => {
  it("ranks the pool, writes the lever and emits precheck.fired", async () => {
    const result = await run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidateCount).toBe(POOL.length);
    expect(result.value.rankedCount).toBe(POOL.length);
    expect(result.value.wave).toBe(1);
    expect(emitted).toContain("precheck.fired");
  });

  it("puts rail row 2 in motion — the parent sees the pre-check before the call, not after", async () => {
    const before = await positions.getJourneySteps(
      PARENT as string as ParentId,
    );
    expect(before.ok && before.value[1]?.state).toBe("pending");
    await run();
    const after = await positions.getJourneySteps(PARENT as string as ParentId);
    expect(after.ok && after.value[1]?.state).toBe("in-motion");
  });

  it("never ranks more than `config.matching.precheckN` (03 §7.4)", async () => {
    const many = Array.from({ length: MATCHING.precheckN + 5 }, (_, index) =>
      candidate(index + 1),
    );
    const result = await run(many);
    expect(result.ok && result.value.rankedCount).toBe(MATCHING.precheckN);
  });

  it("emits precheck.failed for the admin chase when the engine refuses, and writes no lever", async () => {
    configureScoring({
      ...engine(),
      topN: async () =>
        err("PROVIDER_ERROR", "distance failed", {
          reason: "distance-failed" as const,
        }),
    });
    const result = await run();
    expect(result.ok).toBe(false);
    expect(emitted).toContain("precheck.failed");
    const steps = await positions.getJourneySteps(PARENT as string as ParentId);
    expect(steps.ok && steps.value[1]?.state).toBe("pending");
  });

  it("answers NOT_FOUND for a position that does not exist, and writes nothing", async () => {
    const result = await autofire({
      pool: async () => ok(POOL),
      clock: () => NOW,
    })("0f1e2d3c-0000-4000-8000-0000000000ff" as PositionId, convert);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });

  it.fails(
    "PINNED (03 §7.4 — the blast): autofire notifies each ranked nanny with `precheck-nanny`",
    async () => {
      // Not built. A `comms` `Recipient` needs an `Email`; the only nanny read this module has is the
      // marketplace-safe `nanny_public` (07 §5.2 — first name, no address), and no document authorises a
      // service-scope read of nanny contact details. The lever, the ranking and `precheck.fired` ship; the
      // blast waits for a recipient port. Recorded in the L-007 `1e` PROGRESS entry.
      const result = await run();
      expect(result.ok && "notified" in result.value).toBe(true);
    },
  );
});
