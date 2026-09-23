// `4d` — `dfy-waves`, proved by running it (`ecc-lite` rule 2), over the **real** `autofire` and the real
// `positions` inside rather than a recording double. That is the point: the whole idempotency claim is that
// `autofire` writes the lever and the cohort is "OPEN with no lever", so a double that did not write one would
// prove the opposite of what is claimed.
//
//   the position with no lever was pre-checked · the one that already has one was not · the one that is not
//   OPEN was not · and a second fire is a no-op, because the first wrote the lever.
import { beforeEach, describe, expect, it } from "vitest";
import { LOCALE, MATCHING } from "@/modules/config";
import {
  autofire,
  configureMatching,
  stubMatching,
  sweepPrecheckWaves,
} from "@/modules/matching";
import {
  configureEvents,
  configureUnitOfWork,
  createEvents,
  createUnitOfWork,
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
  Instant,
  NannyId,
  ParentId,
  PositionId,
  UserId,
} from "@/modules/shared-types";

const NOW = "2026-07-15T08:00:00.000Z" as Instant; // 09:00 London, BST — when dfy-waves runs
const WAITING = "0f1e2d3c-0000-4000-8000-0000000000d1" as PositionId;
const ALREADY = "0f1e2d3c-0000-4000-8000-0000000000d2" as PositionId;
const PARENT_A = "0a1b2c3d-0000-4000-8000-0000000000e1" as UserId;
const PARENT_B = "0a1b2c3d-0000-4000-8000-0000000000e2" as UserId;
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
let blasted: Array<{ positionId: PositionId; wave: number }>;

const openPosition = (positionId: PositionId, parentId: UserId) =>
  advance({
    entity: { kind: "position", id: positionId },
    transition: "P-2",
    actor: convert,
    payload: {
      parentId: parentId as string as ParentId,
      source: "results_signup",
      detail: DETAIL,
      recipient: { email: "ada@example.test" as Email, name: "Ada" },
      mobile: `${LOCALE.phonePrefix}7700900123`,
    },
    expectedFrom: null,
    idempotencyKey: `open:${positionId as string}`,
  });

const leverOf = async (positionId: PositionId) => {
  const read = await store.get(positionId);
  return read.ok ? (read.value?.precheck ?? null) : null;
};

beforeEach(async () => {
  blasted = [];
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  configureScoring(
    stubScoring({ distance: stubDistanceProvider(), config: MATCHING }),
  );

  store = memoryPositionStore();
  registerPositionsSlice(
    createPositionsSlice({
      store,
      isInServiceArea: async () => true,
      clock: () => NOW,
    }),
  );
  // P-2 cascades into C-a on the call mirror, which `call-layer` owns; a fake stands in for it here.
  registerSlice({
    entity: "call",
    handlers: [
      {
        id: "C-a",
        run: async (input) =>
          ok({
            entity: input.entity,
            stage: "awaiting-slot" as const,
            version: 1,
            changedAt: NOW,
            cascaded: [],
            events: [],
          }),
      },
    ],
  });
  configurePositions(createPositions({ store }));

  // The **real** `autofire` on the connector, over the stub's other methods, which this sweep never touches.
  // The stub's own `autofire` writes no lever, and a lever that is not written is the one thing this suite
  // cannot do without: it is what takes a position out of the second run's cohort.
  configureMatching({
    ...stubMatching({ pool: POOL }),
    autofire: autofire({
      pool: async () => ok(POOL),
      clock: () => NOW,
      blast: async (input) => {
        blasted.push({ positionId: input.positionId, wave: input.wave });
        return ok({ notified: input.nannyIds.length });
      },
    }),
  });
});

describe("dfy-waves — the net under the pre-check (03 §7.4)", () => {
  it("pre-checks the OPEN position with no lever, leaves the one that has one, and is a no-op twice", async () => {
    await openPosition(WAITING, PARENT_A);
    await openPosition(ALREADY, PARENT_B);
    // `ALREADY` has been pre-checked; `WAITING`'s autofire never ran (03 §7.4 — a blast failure never fails
    // the position write, so this is exactly the state the sweep exists to catch).
    await positions.recordPrecheck(ALREADY, {
      firedAt: "2026-07-14T08:00:00.000Z" as Instant,
      expiresAt: "2026-07-17T08:00:00.000Z" as Instant,
      wave: 1,
    });
    expect(await leverOf(WAITING)).toBeNull();

    const first = await sweepPrecheckWaves(NOW);

    expect(first.ok && first.value).toEqual({ handled: 1, skipped: 0 });
    expect(await leverOf(WAITING)).not.toBeNull();
    expect(blasted.map((entry) => entry.positionId)).toEqual([WAITING]);

    // The lever the first run wrote is what takes the position out of the second run's cohort. Nothing
    // durable records that the sweep happened; the state it left behind is the whole mechanism.
    const second = await sweepPrecheckWaves(NOW);

    expect(second.ok && second.value).toEqual({ handled: 0, skipped: 0 });
    expect(blasted.map((entry) => entry.positionId)).toEqual([WAITING]);
  });

  it("fires wave 1, which is the whole of MATCHING.precheck.waves today", async () => {
    await openPosition(WAITING, PARENT_A);

    await sweepPrecheckWaves(NOW);

    expect(blasted).toEqual([{ positionId: WAITING, wave: 1 }]);
    expect(MATCHING.precheck.waves).toBe(1);
  });

  it("leaves a position that is not OPEN — a DRAFT has never been published to look for anyone for", async () => {
    const draft = "0f1e2d3c-0000-4000-8000-0000000000d3" as PositionId;
    await store.put({
      positionId: draft,
      parentId: PARENT_A as string as ParentId,
      source: "results_signup",
      stage: "DRAFT",
      detail: DETAIL,
      recipient: { email: "ada@example.test" as Email, name: "Ada" },
      createdAt: NOW,
      precheck: null,
      version: 1,
    } as never);

    const run = await sweepPrecheckWaves(NOW);

    expect(run.ok && run.value).toEqual({ handled: 0, skipped: 0 });
    expect(await leverOf(draft)).toBeNull();
  });

  // ★ PINNED, with its owner. `MATCHING.precheck.waves` is 1 (@pending 01 §10 O-8 / `08.25`), and `autofire`
  // hardcodes `FIRST_WAVE` — so wave 1 is the whole of the configured behaviour and the sweep is complete as
  // it stands. A **second** wave is not a cron's to invent: it needs `autofire` to take a wave number, and it
  // needs a rule for which nannies a re-blast may reach (the ones wave 1 already asked? only the ones who did
  // not answer?), which is a product decision 08.25 owes and `matching`'s to implement once it is made.
  //
  // OWNER: 08.25 / 01 §10 O-8 (BAI rules the cadence), then `matching`.
  it.fails(
    "fires a second wave for a position whose first wave found nobody",
    async () => {
      await openPosition(WAITING, PARENT_A);
      await sweepPrecheckWaves(NOW);

      const later = "2026-07-20T08:00:00.000Z" as Instant;
      await sweepPrecheckWaves(later);

      expect(blasted.map((entry) => entry.wave)).toEqual([1, 2]);
    },
  );
});
