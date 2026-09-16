// The `placements` half of swap test 1 (03 §11 — "with `placements` stubbed, cascades hit the stub slice"): keep
// `index.ts` + `types.ts`, and the L-row slice the boot file hands over still honours the handler contract, while
// the I-3 read still answers through the binding.
//
// As in `connections`, this file never imports `positions`: 01 §2.3 gives `placements` no arrow to it, and the
// boundary lint holds in tests too. The dispatch half of the swap is proved in `positions`' own suite.
import { beforeEach, describe, expect, it } from "vitest";
import {
  configurePlacements,
  placements,
  stubPlacements,
  stubPlacementsSlice,
} from "@/modules/placements";
import type {
  Actor,
  AdvanceInput,
  ConnectionId,
  Instant,
  ISODate,
  PlacementId,
  PositionId,
  TransitionId,
  UnitOfWork,
} from "@/modules/shared-types";

const POSITION_ID = "position-1" as PositionId;
const AT = "2026-01-01T00:00:00+00:00" as Instant;
const ADMIN: Actor = Object.freeze({ kind: "admin", id: "admin-1" as never });
const UOW = {} as UnitOfWork;

const inputFor = (transition: TransitionId): AdvanceInput<TransitionId> =>
  Object.freeze({
    entity: { kind: "placement" as const, id: "placement-1" as PlacementId },
    transition,
    actor: ADMIN,
    payload: Object.freeze({}),
    expectedFrom: null,
    idempotencyKey: `key-${transition}`,
  });

beforeEach(() => {
  configurePlacements(stubPlacements());
});

describe("the L-row slice the boot file registers", () => {
  it("hands back one handler per transition id, in order", () => {
    const slice = stubPlacementsSlice(["L-1", "L-1b", "L-2"], "CONFIRMED", AT);

    expect(slice.map((handler) => handler.id)).toEqual(["L-1", "L-1b", "L-2"]);
  });

  it("runs inside the unit of work it is handed, never one of its own", async () => {
    const [handler] = stubPlacementsSlice(["L-1"], "CONFIRMED", AT);

    const result = await handler!.run(inputFor("L-1"), UOW);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.stage).toBe("CONFIRMED");
  });

  it("emits nothing — L-1b's openDfyAccess and the placement events are Phase 1f", async () => {
    const [handler] = stubPlacementsSlice(["L-1b"], "ACTIVE", AT);

    const result = await handler!.run(inputFor("L-1b"), UOW);

    expect(result.ok && result.value.events).toEqual([]);
    expect(result.ok && result.value.cascaded).toEqual([]);
  });
});

describe("the read positions calls for invariant I-3", () => {
  it("returns null when a position has no placement, rather than an empty object", async () => {
    const result = await placements.activeForPosition(POSITION_ID);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeNull();
  });

  it("returns the placement facts hours, rate and start date when there is one", async () => {
    configurePlacements(
      stubPlacements({
        [POSITION_ID]: {
          placementId: "placement-1" as PlacementId,
          positionId: POSITION_ID,
          connectionId: "connection-1" as ConnectionId,
          state: "ACTIVE",
          weeklyHours: 40,
          hourlyRatePence: 1500, // config-literal-ok: a placement fixture, not a price — PRICES owns real money (03 §5.2)
          startDate: "2026-02-01" as ISODate,
        },
      }),
    );

    const result = await placements.activeForPosition(POSITION_ID);

    expect(result.ok && result.value?.state).toBe("ACTIVE");
    expect(result.ok && result.value?.weeklyHours).toBe(40);
  });
});
