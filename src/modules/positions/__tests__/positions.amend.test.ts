// `amend()` — the one write 03 §2.2 gives a fact that moves without a transition, and the road a parent takes
// to change what she asked for (04 §6.2 S-P-05 exit "S-P-04 (edit)", S-P-04 state "edit (no re-fire)").
//
// **Every claim here asserts the stored row, never the returned `ok`.** The defect this suite exists to keep
// out is the one it was written against: `amend` bumped the version, emitted `position.amended` and answered
// success while `input.fields` was never applied to anything — a write that reports success and changes
// nothing. A test that asserted the result would have passed against that code.
import { beforeEach, describe, expect, it } from "vitest";
import {
  configurePositions,
  createPositions,
  memoryPositionStore,
  positions,
} from "@/modules/positions";
import type {
  PositionMatchDetail,
  PositionRecord,
  PositionStore,
} from "@/modules/positions";
import {
  configureEvents,
  configureUnitOfWork,
  createEvents,
  createUnitOfWork,
  log,
  memoryEventLogStore,
  memoryTransactionOpener,
} from "@/modules/platform";
import type {
  Actor,
  Email,
  EntityRef,
  Instant,
  ParentId,
  PositionId,
  PositionStage,
  UserId,
} from "@/modules/shared-types";

const NOW = "2026-01-09T08:00:00.000Z" as Instant;
const POSITION = "0f1e2d3c-0000-4000-8000-0000000000a1" as PositionId;
const PARENT = "0a1b2c3d-0000-4000-8000-0000000000b1" as UserId;
const OTHER_PARENT = "0a1b2c3d-0000-4000-8000-0000000000b2" as UserId;

const parent: Actor = { kind: "user", id: PARENT, role: "parent" };
const stranger: Actor = { kind: "user", id: OTHER_PARENT, role: "parent" };
const admin: Actor = { kind: "admin", id: "admin-1" as never };

const entity: EntityRef = { kind: "position", id: POSITION };

const DETAIL = Object.freeze({
  area: { area: "Islington", district: "N1" },
  schedule: { type: "Fixed", blocks: [{ day: 0, part: "morning" }] },
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
} as const) satisfies PositionMatchDetail;

/** What a parent actually changes on S-P-04: a different district, a second child, another morning. */
const CHANGED = Object.freeze({
  area: { area: "Hackney", district: "E8" },
  schedule: {
    type: "Fixed",
    blocks: [
      { day: 0, part: "morning" },
      { day: 2, part: "afternoon" },
    ],
  },
  requirements: {
    childAgeMonths: [
      { min: 12, max: 24 },
      { min: 36, max: 48 },
    ],
    capacity: 2,
    specialNeeds: false,
    licence: true,
    car: true,
    vaccination: false,
    nonSmoker: true,
    pets: false,
    roleType: "",
  },
} as const) satisfies PositionMatchDetail;

let store: PositionStore;

const seed = async (stage: PositionStage, parentId: UserId = PARENT) => {
  const record: PositionRecord = {
    positionId: POSITION,
    parentId: parentId as string as ParentId,
    source: "results_signup",
    stage,
    detail: DETAIL,
    recipient: { email: "ada@example.test" as Email, name: "Ada" },
    createdAt: NOW,
    precheck: null,
    version: 1,
  };
  const written = await store.put(record);
  expect(written.ok).toBe(true);
};

const stored = async (): Promise<PositionRecord> => {
  const found = await store.get(POSITION);
  if (!found.ok || found.value === null)
    throw new Error("the seeded position is gone");
  return found.value;
};

beforeEach(() => {
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  store = memoryPositionStore();
  configurePositions(createPositions({ store }));
});

describe("amend applies the fields to the row", () => {
  it("writes the new detail to the stored position, not just a version bump", async () => {
    await seed("OPEN");
    const result = await positions.amend({
      entity,
      actor: parent,
      fields: { detail: CHANGED },
      idempotencyKey: "amend-1",
    });
    expect(result.ok).toBe(true);
    const row = await stored();
    expect(row.detail.area.district).toBe("E8");
    expect(row.detail.requirements.capacity).toBe(2);
    expect(row.detail.schedule?.blocks).toHaveLength(2);
    expect(row.detail.requirements.childAgeMonths).toHaveLength(2);
  });

  it("leaves the stage and the pre-check lever alone — S-P-04 edit does not re-fire", async () => {
    await seed("OPEN");
    await positions.amend({
      entity,
      actor: parent,
      fields: { detail: CHANGED },
      idempotencyKey: "amend-2",
    });
    const row = await stored();
    expect(row.stage).toBe("OPEN");
    expect(row.precheck).toBeNull();
    expect(row.version).toBe(2);
  });

  it("refuses a field it does not know rather than dropping it silently", async () => {
    await seed("OPEN");
    const result = await positions.amend({
      entity,
      actor: parent,
      fields: { detail: CHANGED, hoursPerWeek: "30" },
      idempotencyKey: "amend-3",
    });
    expect(result.ok).toBe(false);
    const row = await stored();
    expect(row.detail.area.district).toBe("N1");
    expect(row.version).toBe(1);
  });

  it("refuses an empty amend rather than burning a version on nothing", async () => {
    await seed("OPEN");
    const result = await positions.amend({
      entity,
      actor: parent,
      fields: {},
      idempotencyKey: "amend-4",
    });
    expect(result.ok).toBe(false);
    expect((await stored()).version).toBe(1);
  });

  // `security-reviewer`, LOW 2: an unconstrained `startDate` reached Postgres' implicit cast to `date` and came
  // back as a generic INTERNAL. It is refused here, with a message, instead.
  it("refuses a startDate that is not a date, and keeps one that is", async () => {
    await seed("OPEN");
    const bad = await positions.amend({
      entity,
      actor: parent,
      fields: { detail: { ...CHANGED, startDate: "next Tuesday-ish" } },
      idempotencyKey: "amend-date-bad",
    });
    expect(bad.ok).toBe(false);
    expect((await stored()).detail.area.district).toBe("N1");

    const good = await positions.amend({
      entity,
      actor: parent,
      fields: { detail: { ...CHANGED, startDate: "2026-03-02" } },
      idempotencyKey: "amend-date-good",
    });
    expect(good.ok).toBe(true);
    expect((await stored()).detail.startDate).toBe("2026-03-02");
  });

  it("refuses a detail that is not one — the boundary validates, it does not trust", async () => {
    await seed("OPEN");
    const result = await positions.amend({
      entity,
      actor: parent,
      fields: { detail: { area: { area: "Islington" } } },
      idempotencyKey: "amend-5",
    });
    expect(result.ok).toBe(false);
    expect((await stored()).detail.area.district).toBe("N1");
  });
});

describe("amend obeys the 03 §2.5 actor rule", () => {
  it("refuses a parent on a position that is not hers", async () => {
    await seed("OPEN");
    const result = await positions.amend({
      entity,
      actor: stranger,
      fields: { detail: CHANGED },
      idempotencyKey: "amend-6",
    });
    expect(result.ok).toBe(false);
    expect((await stored()).detail.area.district).toBe("N1");
  });

  it("lets the matchmaker amend a position she does not own", async () => {
    await seed("OPEN");
    const result = await positions.amend({
      entity,
      actor: admin,
      fields: { detail: CHANGED },
      idempotencyKey: "amend-7",
    });
    expect(result.ok).toBe(true);
    expect((await stored()).detail.area.district).toBe("E8");
  });
});

/**
 * The ruling (recorded in the L-007 PROGRESS entry). A parent edits **before anyone has been put in front of
 * her** — `DRAFT` and `OPEN`. `CONNECTING` is the stage 04 §3.1 step 14 writes immediately after the
 * introduction call, with meetings arranged on the terms she gave; `ACTIVE` has a nanny placed and the hours,
 * rate and start living on the **placement**. Past that line the matchmaker makes the change, and the parent
 * keeps P-7 (close) and P-6 (end), which are already built.
 */
describe("a parent may edit only before the introduction call", () => {
  for (const stage of ["DRAFT", "OPEN"] as const)
    it(`allows a parent at ${stage}`, async () => {
      await seed(stage);
      const result = await positions.amend({
        entity,
        actor: parent,
        fields: { detail: CHANGED },
        idempotencyKey: `amend-${stage}`,
      });
      expect(result.ok).toBe(true);
      expect((await stored()).detail.area.district).toBe("E8");
    });

  for (const stage of ["CONNECTING", "ACTIVE", "ENDED", "CLOSED"] as const)
    it(`refuses a parent at ${stage}`, async () => {
      await seed(stage);
      const result = await positions.amend({
        entity,
        actor: parent,
        fields: { detail: CHANGED },
        idempotencyKey: `amend-${stage}`,
      });
      expect(result.ok).toBe(false);
      expect((await stored()).detail.area.district).toBe("N1");
    });

  it("still lets the matchmaker change a CONNECTING position — that is where the change goes", async () => {
    await seed("CONNECTING");
    const result = await positions.amend({
      entity,
      actor: admin,
      fields: { detail: CHANGED },
      idempotencyKey: "amend-admin-connecting",
    });
    expect(result.ok).toBe(true);
    expect((await stored()).detail.area.district).toBe("E8");
  });
});
