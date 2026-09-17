// The three server actions behind S-P-02 (01 §4e): the session is the only identity (`auth.requireRole`), a
// signed-out call fails closed as a `ClientResult`, a hold is the calendar's own write, and the button's write
// refuses a position that is not the signed-in parent's open call. `loadCallPage` answers the route its one
// decision.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import {
  chooseSlotAction,
  configureCallLayer,
  createCallLayer,
  createCallLayerSlice,
  holdSlotAction,
  listSlotsAction,
  loadCallPage,
  memoryCallMirrorStore,
  registerCallLayerSlice,
} from "@/modules/call-layer";
import type { CallMirror } from "@/modules/call-layer";
import { unconfiguredComms } from "@/modules/comms";
import {
  configureEvents,
  configureUnitOfWork,
  createEvents,
  createUnitOfWork,
  log,
  memoryEventLogStore,
  memoryTransactionOpener,
} from "@/modules/platform";
import {
  configureScheduling,
  createSchedulingStub,
} from "@/modules/scheduling";
import type { Scheduling } from "@/modules/scheduling";
import type {
  AvailabilityRule,
  Email,
  ISO,
  PositionId,
  RuleId,
  SlotId,
  UserId,
} from "@/modules/shared-types";

const NOW = "2026-01-09T08:00:00.000Z" as ISO;
const PARENT = "0a1b2c3d-0000-4000-8000-000000000011";
const POSITION = "0f1e2d3c-0000-4000-8000-000000000001" as PositionId;
const OTHER_POSITION = "0f1e2d3c-0000-4000-8000-000000000002" as PositionId;

const rules: ReadonlyArray<AvailabilityRule> = [0, 1, 2, 3, 4].map(
  (weekday) => ({
    id: `rule-${weekday}` as RuleId,
    weekday: weekday as AvailabilityRule["weekday"],
    startLocal: "09:00",
    endLocal: "11:00",
  }),
);

const mirror: CallMirror = {
  positionId: POSITION,
  parentId: PARENT as UserId,
  type: "matchmaking",
  state: "awaiting-slot",
  bookingId: null,
  requestedAt: NOW,
  recipient: { email: "parent@example.test" as Email },
  noAnswerCount: 0,
  version: 1,
};

let scheduling: Scheduling;

// The uuid mint is pinned for the reason `call-layer.inside.test.ts` records (platform's `piiSafeString`
// refuses ~15 % of random uuids); the clock is pinned so `nowInstant()` and the stub's clock agree.
const mintedIds = { count: 0 };
const deterministicUuid =
  (): `${string}-${string}-${string}-${string}-${string}` => {
    mintedIds.count += 1;
    return `a1b2c3d4-e5f6-4a7b-8c9d-aaaaab${mintedIds.count.toString(16).padStart(5, "0")}a`;
  };

const signIn = (signedInUserId?: string) =>
  configureAuth(
    stubAuth({
      users: [
        {
          id: PARENT,
          email: "parent@example.test" as Email,
          password: "pw",
          role: "parent",
        },
      ],
      ...(signedInUserId === undefined ? {} : { signedInUserId }),
    }),
  );

const aSlot = async (): Promise<SlotId> => {
  const slots = await scheduling.getAvailableSlots({
    kind: "matchmaking",
    from: NOW,
    to: "2026-01-23T00:00:00.000Z" as ISO,
  });
  if (!slots.ok) throw new Error("no slots");
  return slots.value[0]!.id;
};

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse(NOW), toFake: ["Date"] });
  vi.spyOn(crypto, "randomUUID").mockImplementation(deterministicUuid);
  configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  scheduling = createSchedulingStub({ clock: () => NOW, rules });
  configureScheduling(scheduling);
  const store = memoryCallMirrorStore([mirror]);
  registerCallLayerSlice(
    createCallLayerSlice({ store, scheduling, clock: () => NOW }),
  );
  configureCallLayer(
    createCallLayer({
      store,
      scheduling,
      comms: unconfiguredComms,
      clock: () => NOW,
    }),
  );
  signIn(PARENT);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("signed out", () => {
  it("every action and the page read fail closed, never throw", async () => {
    signIn(undefined);
    const held = await holdSlotAction(await aSlot(), POSITION);
    expect(!held.ok && held.error.code).toBe("UNAUTHENTICATED");
    const chosen = await chooseSlotAction({
      positionId: POSITION,
      slotId: await aSlot(),
    });
    expect(!chosen.ok && chosen.error.code).toBe("UNAUTHENTICATED");
    const listed = await listSlotsAction();
    expect(!listed.ok && listed.error.code).toBe("UNAUTHENTICATED");
    expect(await loadCallPage()).toEqual({ kind: "signed-out" });
  });
});

describe("signed in as the parent", () => {
  it("loads the page with her open call and the London days", async () => {
    const load = await loadCallPage();
    expect(load.kind).toBe("page");
    if (load.kind !== "page") return;
    expect(load.view.positionId).toBe(POSITION);
    expect(load.view.state).toBe("awaiting-slot");
    expect(load.days?.[0]?.legend).toBe("Friday 9 January");
  });

  it("holds a slot, then the button books it on her position", async () => {
    const slotId = await aSlot();
    const held = await holdSlotAction(slotId, POSITION);
    expect(held.ok).toBe(true);
    if (!held.ok) return;

    const chosen = await chooseSlotAction({
      positionId: POSITION,
      slotId,
      holdId: held.value.holdId,
    });
    expect(chosen.ok).toBe(true);
    const load = await loadCallPage();
    expect(load.kind === "page" && load.view.chosen?.start).toBe(
      slotId.slice("default:".length),
    );
  });

  it("refuses a position that is not her open call", async () => {
    const chosen = await chooseSlotAction({
      positionId: OTHER_POSITION,
      slotId: await aSlot(),
    });
    expect(!chosen.ok && chosen.error.code).toBe("NOT_FOUND");
  });

  it("re-lists the days for the retry", async () => {
    const listed = await listSlotsAction();
    expect(listed.ok && listed.value.length).toBeGreaterThan(0);
  });

  it("answers no-call once the call is done, so the route sends her to the dashboard", async () => {
    const store = memoryCallMirrorStore([{ ...mirror, state: "done" }]);
    configureCallLayer(
      createCallLayer({ store, scheduling, comms: unconfiguredComms }),
    );
    expect(await loadCallPage()).toEqual({ kind: "no-call" });
  });
});

describe("holdSlotAction — the position is checked, not taken on trust", () => {
  it("refuses a hold against a position that is not the caller's own open call", async () => {
    const held = await holdSlotAction(
      await aSlot(),
      "11111111-0000-4000-8000-000000000099" as PositionId,
    );
    expect(!held.ok && held.error.code).toBe("FORBIDDEN");
  });

  it("says the same thing whether the position is another family's or does not exist (07 §4)", async () => {
    const someoneElses = await holdSlotAction(await aSlot(), OTHER_POSITION);
    const nonsense = await holdSlotAction(
      await aSlot(),
      "22222222-0000-4000-8000-000000000098" as PositionId,
    );
    expect(!someoneElses.ok && someoneElses.error.message).toBe(
      !nonsense.ok ? nonsense.error.message : "",
    );
  });
});
