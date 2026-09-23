// `londonWallClock` is what "today / yesterday in London" and "the waking hours are 07:00–22:00 London" are
// allowed to read (01 §4f). It is asserted at the two BST transitions in both directions, because that is the
// hour a naive `+1` or a stale offset table gets wrong, and every one of the five re-based jobs (`08.22` · `08.23`
// · `08.24` · `08.30` · `08.26`) derives its date or its hour from it.
//
// The 2026 transitions: BST begins 2026-03-29T01:00Z, BST ends 2026-10-25T01:00Z. `Intl` owns the dates so this
// file names instants, never an offset.
import { describe, expect, it } from "vitest";
import type { Instant } from "@/modules/shared-types";
import { londonWallClock } from "../lib/london-wall-clock";

const at = (iso: string): Instant => iso as Instant;

describe("through GMT the London wall clock is UTC", () => {
  it("reads a winter instant unchanged", () => {
    expect(londonWallClock(at("2026-01-15T08:00:00.000Z"))).toEqual({
      date: "2026-01-15",
      hour: 8,
      minute: 0,
      weekday: 4,
    });
  });

  it("keeps the London date on the UTC date at 23:xx", () => {
    expect(londonWallClock(at("2026-01-15T23:30:00.000Z")).date).toBe(
      "2026-01-15",
    );
  });
});

describe("through BST the London wall clock is an hour ahead of UTC", () => {
  it("reads a summer instant as UTC+1", () => {
    expect(londonWallClock(at("2026-07-15T08:00:00.000Z"))).toEqual({
      date: "2026-07-15",
      hour: 9,
      minute: 0,
      weekday: 3,
    });
  });

  it("rolls the London date forward at 23:xx UTC — the instant a midnight job actually fires in summer", () => {
    expect(londonWallClock(at("2026-07-15T23:05:00.000Z"))).toEqual({
      date: "2026-07-16",
      hour: 0,
      minute: 5,
      weekday: 4,
    });
  });
});

describe("spring forward — 2026-03-29T01:00Z, GMT → BST", () => {
  it("is still GMT the minute before", () => {
    expect(londonWallClock(at("2026-03-29T00:59:00.000Z"))).toMatchObject({
      date: "2026-03-29",
      hour: 0,
      minute: 59,
    });
  });

  it("is already BST at the transition — 01:00Z reads 02:00, and 01:xx London never happens that day", () => {
    expect(londonWallClock(at("2026-03-29T01:00:00.000Z"))).toMatchObject({
      date: "2026-03-29",
      hour: 2,
      minute: 0,
    });
  });
});

describe("fall back — 2026-10-25T01:00Z, BST → GMT", () => {
  it("reads 01:30 on the BST side", () => {
    expect(londonWallClock(at("2026-10-25T00:30:00.000Z"))).toMatchObject({
      date: "2026-10-25",
      hour: 1,
      minute: 30,
    });
  });

  it("reads 01:30 again on the GMT side — the repeated hour, one UTC hour later", () => {
    expect(londonWallClock(at("2026-10-25T01:30:00.000Z"))).toMatchObject({
      date: "2026-10-25",
      hour: 1,
      minute: 30,
    });
  });
});

describe("the weekday is the London weekday, not the UTC one", () => {
  it("reports Sunday for a Saturday-in-UTC instant that is Sunday in London", () => {
    // 2026-07-18 is a Saturday; 23:10Z is 00:10 on Sunday the 19th in London.
    expect(londonWallClock(at("2026-07-18T23:10:00.000Z"))).toMatchObject({
      date: "2026-07-19",
      weekday: 0,
    });
  });
});
