// Rail rows 4-6 (04 §7.1): the document writes `{nanny}` on three lines and `1e` shipped all three without a
// name, because no connector put a person behind the read. `2d` closed that (kickoff debt 2) — the name rides in
// on `ConnectionSummary.nannyFirstName`, which `connections` fills from the one `nanny_public` read. `positions`
// imports `connections` (01 §2.3) and still imports nothing new.
//
// Row 6 is keyed by the placement, which carries `connectionId` — so the name is looked up on the connection the
// placement was made from (I-3: exactly one), never guessed from the newest row.
//
// Written RED: all three lines carried a time or a date and no name.
import { describe, expect, it } from "vitest";
import type { ConnectionSummary } from "@/modules/connections";
import type { PlacementRead } from "@/modules/placements";
import { journeyRows4to8 } from "../lib/journey-rows-4-to-8";
import type {
  ConnectionId,
  Instant,
  NannyId,
  PlacementId,
  PositionId,
} from "@/modules/shared-types";

const LABELS = { meetings: "Meetings", hire: "Hire", app: "Your app" } as const;
const POSITION = "44444444-4444-4444-8444-444444444444" as PositionId;
const NANNY = "22222222-2222-4222-8222-222222222222" as NannyId;
const MEETING = "2026-10-06T09:00:00.000Z" as Instant;

const summary = (over: Partial<ConnectionSummary> = {}): ConnectionSummary =>
  Object.freeze({
    connectionId: "c-1" as ConnectionId,
    positionId: POSITION,
    nannyId: NANNY,
    stage: "INTRO_SCHEDULED",
    origin: "parent_request",
    meetingAt: MEETING,
    nannyFirstName: "Priya",
    ...over,
  }) as ConnectionSummary;

const placement = (over: Partial<PlacementRead> = {}): PlacementRead =>
  Object.freeze({
    placementId: "pl-1" as PlacementId,
    positionId: POSITION,
    connectionId: "c-1" as ConnectionId,
    state: "ACTIVE",
    weeklyHours: 30,
    hourlyRatePence: 1800, // config-literal-ok: a row fixture, not a price
    startDate: "2026-10-12",
    ...over,
  }) as PlacementRead;

const rows = (
  connections: ReadonlyArray<ConnectionSummary>,
  placementRead: PlacementRead | null = null,
) => journeyRows4to8({ connections, placement: placementRead, labels: LABELS });

describe("rail rows 4-6 — the nanny is named (04 §7.1 `{nanny}`; kickoff debt 2)", () => {
  it("row 4 in motion reads `Meeting with {nanny} — {day} {time}`", () => {
    const step = rows([summary()])[0];

    expect(step?.state).toBe("in-motion");
    expect(step?.detail).toContain("Meeting with Priya");
  });

  it("row 4 keeps its nameless line when the name could not be read", () => {
    const step = rows([summary({ nannyFirstName: undefined })])[0];

    expect(step?.detail).toContain("Meeting —");
    expect(step?.detail).not.toContain("undefined");
  });

  it("row 4 done names her too", () => {
    const step = rows([summary({ stage: "INTRO_COMPLETE" })])[0];

    expect(step?.state).toBe("done");
    expect(step?.detail).toBe("Met Priya");
  });

  it("row 5 names the nanny a family is going ahead with", () => {
    const step = rows([summary({ stage: "OFFERED" })])[1];

    expect(step?.state).toBe("done");
    expect(step?.detail).toContain("Priya");
  });

  it("row 6 after reads `Hired — {nanny} starts {date}`", () => {
    const step = rows([summary({ stage: "ACTIVE" })], placement())[2];

    expect(step?.state).toBe("done");
    expect(step?.detail).toContain("Hired — Priya starts");
  });

  it("row 6 takes the name from the connection the placement was made from, not the newest row", () => {
    const step = rows(
      [
        summary({
          connectionId: "c-2" as ConnectionId,
          stage: "NOT_SELECTED",
          nannyFirstName: "Amara",
        }),
        summary({ stage: "ACTIVE", nannyFirstName: "Priya" }),
      ],
      placement(),
    )[2];

    expect(step?.detail).toContain("Priya");
    expect(step?.detail).not.toContain("Amara");
  });

  it("row 6 in motion names her while the hire is being confirmed", () => {
    const step = rows(
      [summary({ stage: "CONFIRMED" })],
      placement({ state: "CONFIRMED" }),
    )[2];

    expect(step?.state).toBe("in-motion");
    expect(step?.detail).toContain("Priya");
  });

  it("row 6 still reads without a name", () => {
    const step = rows(
      [summary({ stage: "ACTIVE", nannyFirstName: undefined })],
      placement(),
    )[2];

    expect(step?.detail).toContain("Hired — starts");
    expect(step?.detail).not.toContain("undefined");
  });
});
