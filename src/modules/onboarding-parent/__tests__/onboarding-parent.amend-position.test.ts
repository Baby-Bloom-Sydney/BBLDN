// `amendPositionAction` — the road the hub's card now sends a family down, end to end from the answers S-P-04
// collects to the stored position.
//
// **Every claim here asserts the stored row, never the returned `ok`** — the same rule `positions.amend.test.ts`
// was written under, and for the same reason: the write this road replaces reported an outcome and changed
// nothing, so a suite that read the result would have passed against it.
import { beforeEach, describe, expect, it } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { amendPositionAction } from "@/modules/onboarding-parent";
import {
  configurePositions,
  createPositions,
  memoryPositionStore,
} from "@/modules/positions";
import type { PositionRecord, PositionStore } from "@/modules/positions";
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
  Email,
  Instant,
  ParentId,
  PositionId,
  PositionStage,
} from "@/modules/shared-types";
import { positionDetailOf } from "@/modules/matching";
import type { WizardAnswers } from "@/modules/matching";

const NOW = "2026-01-09T08:00:00.000Z" as Instant;
const POSITION = "0f1e2d3c-0000-4000-8000-0000000000a1" as PositionId;
const PARENT = "0a1b2c3d-0000-4000-8000-0000000000b1";

/** What she asked for at create: Islington, one Monday morning, one toddler. */
const ORIGINAL: WizardAnswers = Object.freeze({
  area: { area: "Islington", district: "N1" },
  days: [1] as const,
  parts: ["morning"] as const,
  scheduleType: "Fixed",
  children: [{ ageLabel: "1–2 years" }],
  car: false,
  drivingLicence: false,
  nonSmoker: false,
  petsAtHome: false,
});

/** What she changes it to on the edit screen: another district, a second day, a licence. */
const CHANGED: WizardAnswers = Object.freeze({
  ...ORIGINAL,
  area: { area: "Hackney", district: "E8" },
  days: [1, 3] as const,
  drivingLicence: true,
});

let store: PositionStore;

const stored = async (): Promise<PositionRecord> => {
  const found = await store.get(POSITION);
  if (!found.ok || found.value === null)
    throw new Error("the seeded position is gone");
  return found.value;
};

const seed = async (stage: PositionStage) => {
  const detail = positionDetail();
  const record: PositionRecord = {
    positionId: POSITION,
    parentId: PARENT as string as ParentId,
    source: "results_signup",
    stage,
    detail,
    recipient: { email: "ada@example.test" as Email, name: "Ada" },
    createdAt: NOW,
    precheck: null,
    version: 1,
  };
  const written = await store.put(record);
  expect(written.ok).toBe(true);
};

// The create-side mapping, so the seed is the row `createPositionAction` would have written from `ORIGINAL`
// rather than a hand-built one that could quietly disagree with it.
function positionDetail(): PositionRecord["detail"] {
  const detail = positionDetailOf(ORIGINAL);
  if (detail === null) throw new Error("the seed answers do not map");
  return detail;
}

beforeEach(() => {
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  configureAuth(
    stubAuth({
      users: [
        { id: PARENT, email: "ada@example.test" as Email, role: "parent" },
      ],
      signedInUserId: PARENT,
    }),
  );
  store = memoryPositionStore();
  configurePositions(createPositions({ store }));
});

describe("the hub's edit road changes the stored position", () => {
  it("writes the new area, the new roster and the new requirement to the row", async () => {
    await seed("OPEN");
    const result = await amendPositionAction({ answers: CHANGED });
    expect(result.ok).toBe(true);
    const row = await stored();
    expect(row.detail.area.district).toBe("E8");
    expect(row.detail.schedule?.blocks.length).toBeGreaterThan(1);
    expect(row.detail.requirements.licence).toBe(true);
  });

  it("does not re-fire the blast or move the stage — 04 §6.2 'edit (no re-fire)'", async () => {
    await seed("OPEN");
    await amendPositionAction({ answers: CHANGED });
    const row = await stored();
    expect(row.stage).toBe("OPEN");
    expect(row.precheck).toBeNull();
    expect(row.version).toBe(2);
  });

  it("leaves the row alone past OPEN — there the matchmaker makes the change", async () => {
    await seed("CONNECTING");
    const result = await amendPositionAction({ answers: CHANGED });
    expect(result.ok).toBe(false);
    const row = await stored();
    expect(row.detail.area.district).toBe("N1");
    expect(row.version).toBe(1);
  });

  it("leaves the row alone when there is no position to change", async () => {
    const result = await amendPositionAction({ answers: CHANGED });
    expect(result.ok).toBe(false);
  });
});
