// The other half of the BST fix. `render-cron-block` schedules **both** candidate UTC hours for a London time;
// this gate is what turns two UTC fires into one London run, and it is the piece that must not be wrong in either
// direction — too tight and a job silently never runs, too loose and it runs twice.
//
// The window is [-5, +50] minutes around the declared London time: wide enough for Vercel's delivery jitter in
// both directions, and strictly inside the ±60 that separates the two candidate fires.
import { describe, expect, it } from "vitest";
import type { CronSpec } from "@/modules/config";
import type { Instant } from "@/modules/shared-types";
import { cronIsDue } from "../cron-is-due";

const at = (iso: string): Instant => iso as Instant;
const daily = (hour: number, minute: number): CronSpec["london"] => ({
  kind: "daily",
  hour,
  minute,
});

describe("an interval cron is always due — it declares no London hour", () => {
  it("passes at any instant", () => {
    expect(
      cronIsDue({ kind: "every", minutes: 15 }, at("2026-07-15T03:47:00.000Z")),
    ).toBe(true);
  });
});

describe("a daily London time is due once per London day, through GMT", () => {
  it("is due at the declared London hour", () => {
    // January: London is UTC. 03:00Z is 03:00 London.
    expect(cronIsDue(daily(3, 0), at("2026-01-15T03:00:00.000Z"))).toBe(true);
  });

  it("is not due at the BST candidate, which lands an hour early in winter", () => {
    expect(cronIsDue(daily(3, 0), at("2026-01-15T02:00:00.000Z"))).toBe(false);
  });
});

describe("a daily London time is due once per London day, through BST", () => {
  it("is due at the BST candidate — 02:00Z is 03:00 London in July", () => {
    expect(cronIsDue(daily(3, 0), at("2026-07-15T02:00:00.000Z"))).toBe(true);
  });

  it("is not due at the GMT candidate, which lands an hour late in summer", () => {
    expect(cronIsDue(daily(3, 0), at("2026-07-15T03:00:00.000Z"))).toBe(false);
  });
});

describe("delivery jitter does not lose a run", () => {
  it("accepts a fire five minutes early", () => {
    expect(cronIsDue(daily(3, 0), at("2026-01-15T02:55:00.000Z"))).toBe(true);
  });

  it("accepts a fire fifty minutes late", () => {
    expect(cronIsDue(daily(3, 0), at("2026-01-15T03:50:00.000Z"))).toBe(true);
  });

  it("rejects a fire six minutes early — beyond jitter, it is someone else's slot", () => {
    expect(cronIsDue(daily(3, 0), at("2026-01-15T02:54:00.000Z"))).toBe(false);
  });

  it("rejects a fire fifty-one minutes late", () => {
    expect(cronIsDue(daily(3, 0), at("2026-01-15T03:51:00.000Z"))).toBe(false);
  });
});

describe("the window wraps midnight rather than treating it as a twenty-three-hour gap", () => {
  it("is due at 00:05 London for a 00:05 job", () => {
    expect(cronIsDue(daily(0, 5), at("2026-01-15T00:05:00.000Z"))).toBe(true);
  });

  it("is due five minutes before midnight for a 00:00 job", () => {
    expect(cronIsDue(daily(0, 0), at("2026-01-14T23:55:00.000Z"))).toBe(true);
  });

  it("is not due an hour before midnight for a 00:00 job", () => {
    expect(cronIsDue(daily(0, 0), at("2026-01-14T23:00:00.000Z"))).toBe(false);
  });
});

describe("a weekly London time also checks the London weekday", () => {
  const monday6 = { kind: "weekly", weekday: 1, hour: 6, minute: 0 } as const;

  it("is due Monday 06:00 London in winter", () => {
    // 2026-01-19 is a Monday.
    expect(cronIsDue(monday6, at("2026-01-19T06:00:00.000Z"))).toBe(true);
  });

  it("is due Monday 06:00 London in summer, which is 05:00Z", () => {
    // 2026-07-20 is a Monday.
    expect(cronIsDue(monday6, at("2026-07-20T05:00:00.000Z"))).toBe(true);
  });

  it("is not due at 06:00Z in summer — that is 07:00 London", () => {
    expect(cronIsDue(monday6, at("2026-07-20T06:00:00.000Z"))).toBe(false);
  });

  it("is not due on Sunday at the same wall-clock time", () => {
    expect(cronIsDue(monday6, at("2026-01-18T06:00:00.000Z"))).toBe(false);
  });
});
