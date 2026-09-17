// The words the rail and the page share (04 §7.1 row 3; 04 §8; 04 §6.2 S-P-02 semantics): London wall clock on
// both sides of DST, the day grouping with the full-date legend, the row-3 line per call state, and the S-P-01
// variant from the open call.
import { describe, expect, it } from "vitest";
import {
  callPageView,
  callRailLine,
  groupSlotsByDay,
  londonSlotWords,
} from "@/modules/call-layer";
import type { OpenCall } from "@/modules/call-layer";
import type { ISO, PositionId, Slot, SlotId } from "@/modules/shared-types";

// 14:00 London on a Tuesday in September (BST) and a Tuesday in January (GMT).
const BST = "2026-09-15T13:00:00.000Z" as ISO;
const GMT = "2026-01-13T14:00:00.000Z" as ISO;

const at = (start: ISO): Slot => ({
  id: `default:${start}` as SlotId,
  calendarId: "default",
  start,
  end: new Date(Date.parse(start) + 30 * 60_000).toISOString() as ISO,
  displaceable: false,
});

describe("londonSlotWords — the London wall clock on both sides of the clock change (03 §3.3 I-6)", () => {
  it("reads a BST instant as its London wall clock", () => {
    const words = londonSlotWords(BST);
    expect(words.short).toBe("Tue 15 Sept, 2:00pm London time");
    expect(words.full).toBe("Tuesday 15 September, 2:00pm London time");
    expect(words.time).toBe("2:00pm");
  });

  it("reads a GMT instant as its London wall clock", () => {
    expect(londonSlotWords(GMT).short).toBe("Tue 13 Jan, 2:00pm London time");
  });
});

describe("groupSlotsByDay — one fieldset per London day, options named in full (04 §6.2 S-P-02)", () => {
  it("groups in order, skips empty days, and names every option with the full date + time + London time", () => {
    const days = groupSlotsByDay([
      at("2026-01-14T09:30:00.000Z" as ISO),
      at("2026-01-13T09:00:00.000Z" as ISO),
      at("2026-01-13T09:30:00.000Z" as ISO),
    ]);
    expect(days.map((day) => day.isoDate)).toEqual([
      "2026-01-13",
      "2026-01-14",
    ]);
    expect(days[0]?.legend).toBe("Tuesday 13 January");
    expect(days[0]?.slots.map((each) => each.time)).toEqual([
      "9:00am",
      "9:30am",
    ]);
    expect(days[1]?.slots[0]?.name).toBe(
      "Wednesday 14 January, 9:30am London time",
    );
  });

  it("puts a 23:30Z slot in July on the next London day", () => {
    const days = groupSlotsByDay([at("2026-07-13T23:30:00.000Z" as ISO)]);
    expect(days[0]?.isoDate).toBe("2026-07-14");
  });
});

describe("callRailLine — 04 §7.1 row 3 per call state (ADR-073)", () => {
  it("says pick a time · the London time · we'll try again · done", () => {
    expect(callRailLine({ state: "awaiting-slot" })).toBe(
      "Introduction call — pick a time",
    );
    expect(callRailLine({ state: "slot-chosen", slotStart: GMT })).toBe(
      "Introduction call — Tue 13 Jan, 2:00pm London time",
    );
    expect(callRailLine({ state: "awaiting-slot", afterNoAnswer: true })).toBe(
      "Introduction call — we'll try again",
    );
    expect(callRailLine({ state: "done" })).toBe("Introduction call — done");
  });
});

describe("callPageView — the S-P-01 variant from the open call (04 §6.2 S-P-01 states)", () => {
  const base: OpenCall = {
    positionId: "p-1" as PositionId,
    state: "awaiting-slot",
    type: "matchmaking",
    afterNoAnswer: false,
  };

  it("picks the variant: plain · after-connect · onboarding · after-no-answer", () => {
    expect(callPageView(base).variant).toBe("matchmaking");
    expect(callPageView({ ...base, aboutNanny: "Priya" }).variant).toBe(
      "after-connect",
    );
    expect(
      callPageView({ ...base, type: "onboarding", aboutNanny: "Priya" })
        .variant,
    ).toBe("onboarding");
    expect(callPageView({ ...base, afterNoAnswer: true }).variant).toBe(
      "after-no-answer",
    );
  });

  it("carries the chosen time only while slot-chosen", () => {
    const booking = {
      id: "b-1",
      calendarId: "default",
      kind: "matchmaking",
      priority: "parent",
      status: "booked",
      subject: { kind: "position", positionId: "p-1", parentId: "u-1" },
      start: GMT,
      end: GMT,
      bookedBy: { kind: "admin", id: "a" },
      bookedAt: GMT,
      version: 1,
    } as never;
    expect(
      callPageView({ ...base, state: "slot-chosen", booking }).chosen?.start,
    ).toBe(GMT);
    expect(callPageView({ ...base, booking }).chosen).toBeUndefined();
  });
});
