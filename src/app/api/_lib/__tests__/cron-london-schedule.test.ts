// The proof that the re-base works, run rather than read (`ecc-lite` rule 2). A test that asserts a cron *string*
// proves nothing about when a job fires: the Sydney schedules were valid cron expressions too, and they were an
// hour out for thirty-one weeks a year.
//
// So this suite executes the schedule. It expands the committed `vercel.json` expression for each declared cron
// into the actual UTC instants Vercel would call it at, walks a window that crosses a BST transition — forwards on
// 2026-03-29 and backwards on 2026-10-25 — and puts every one of those fires through the real `runCron`. What it
// asserts of each job is the thing an operator cares about: **it ran once per London day, at the London time it
// was declared at, on both sides of the boundary.**
//
// Five jobs are named individually and the sweep over the whole list then holds the same standard for every other
// cron, including any added later.
//
// **`4d` re-based the five named ones**, because the five `4b` chose (`proactive` · `compact-daily` ·
// `cleanup-orphan-children` · `soft-lock-stale-children` · `snapshot-pipeline`) are exactly the five BAI struck
// off the schedule on 2026-09-23: they swept phases that do not exist. Every property they were chosen to prove
// is kept, on a cron that is still scheduled and now has a handler — a 03:00 daily across both transitions
// (`expire-trials`), two dailies fifteen minutes apart through BST (`delete-account` / `purge-scrubbed-users`),
// a midnight-adjacent daily whose BST fire lands the UTC evening before (`placement-start-sweep`), and an
// `every` cron the gate never touches (`expire-connections`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CRONS } from "@/modules/config";
import type { CronSpec } from "@/modules/config";
import { londonWallClock } from "@/modules/platform";
import type { Instant } from "@/modules/shared-types";
import { cronIsDue } from "../cron-is-due";

const SECRET = "a-configured-cron-secret";
const MINUTE_MS = 60_000;

// BST begins 2026-03-29T01:00Z and ends 2026-10-25T01:00Z. Each window brackets a transition with whole days
// either side, so a job that drifts by an hour shows up as a missed day or a doubled one.
const SPRING_FORWARD = {
  name: "spring forward (GMT → BST, 2026-03-29)",
  from: "2026-03-26T00:00:00.000Z",
  to: "2026-04-01T00:00:00.000Z",
} as const;
const FALL_BACK = {
  name: "fall back (BST → GMT, 2026-10-25)",
  from: "2026-10-22T00:00:00.000Z",
  to: "2026-10-28T00:00:00.000Z",
} as const;

type Committed = {
  readonly crons: ReadonlyArray<{ path: string; schedule: string }>;
};

const committedSchedules: ReadonlyMap<string, string> = new Map(
  (JSON.parse(readFileSync("vercel.json", "utf8")) as Committed).crons.map(
    (entry) => [entry.path, entry.schedule],
  ),
);

/**
 * The instants a `M H[,H…] * * [W]` or `*\/N * * * *` expression fires at, in UTC, between two instants. Minimal
 * on purpose — it understands exactly the shapes `render-cron-block` emits, and throws on anything else rather
 * than quietly matching nothing.
 */
function firesBetween(
  schedule: string,
  fromIso: string,
  toIso: string,
): ReadonlyArray<Instant> {
  const [minuteField, hourField, dayField, monthField, weekdayField] =
    schedule.split(" ");
  if (dayField !== "*" || monthField !== "*")
    throw new Error(`unsupported cron expression: ${schedule}`);

  const everyMatch = /^\*\/(\d+)$/u.exec(minuteField ?? "");
  const minutes =
    everyMatch === null
      ? [Number(minuteField)]
      : Array.from(
          { length: 60 / Number(everyMatch[1]) },
          (_, i) => i * Number(everyMatch[1]),
        );
  const hours =
    hourField === "*"
      ? Array.from({ length: 24 }, (_, i) => i)
      : (hourField ?? "").split(",").map(Number);
  const weekdays =
    weekdayField === "*"
      ? null
      : new Set((weekdayField ?? "").split(",").map(Number));

  const fires: Instant[] = [];
  for (
    let cursor = Date.parse(fromIso);
    cursor < Date.parse(toIso);
    cursor += MINUTE_MS
  ) {
    const at = new Date(cursor);
    if (weekdays !== null && !weekdays.has(at.getUTCDay())) continue;
    if (!hours.includes(at.getUTCHours())) continue;
    if (!minutes.includes(at.getUTCMinutes())) continue;
    fires.push(at.toISOString() as Instant);
  }
  return fires;
}

/** The London dates on which `spec` actually does work, in order, one entry per due fire. */
function dueLondonDates(
  spec: CronSpec,
  window: { from: string; to: string },
): ReadonlyArray<string> {
  const schedule = committedSchedules.get(spec.path);
  if (schedule === undefined)
    throw new Error(`${spec.path} is not in vercel.json`);
  return firesBetween(schedule, window.from, window.to)
    .filter((at) => cronIsDue(spec.london, at))
    .map((at) => londonWallClock(at).date);
}

const dailyOrWeekly = CRONS.filter((spec) => spec.london.kind !== "every");
const specFor = (path: string): CronSpec => {
  const found = CRONS.find((spec) => spec.path === path);
  if (found === undefined) throw new Error(`${path} is not declared`);
  return found;
};

describe.each([SPRING_FORWARD, FALL_BACK])("$name", (window) => {
  describe.each(dailyOrWeekly.map((spec) => [spec.path, spec] as const))(
    "%s",
    (_path, spec) => {
      it("fires at the declared London wall-clock time on every due fire, on both sides of the transition", () => {
        const schedule = committedSchedules.get(spec.path) ?? "";
        const due = firesBetween(schedule, window.from, window.to).filter(
          (at) => cronIsDue(spec.london, at),
        );

        expect(due.length).toBeGreaterThan(0);
        for (const at of due) {
          const clock = londonWallClock(at);
          expect({ hour: clock.hour, minute: clock.minute }).toEqual({
            hour: spec.london.kind === "every" ? clock.hour : spec.london.hour,
            minute:
              spec.london.kind === "every" ? clock.minute : spec.london.minute,
          });
        }
      });

      it("acts once per London day — the second candidate UTC hour is discarded, never doubled or dropped", () => {
        const dates = dueLondonDates(spec, window);

        expect(new Set(dates).size).toBe(dates.length);
        if (spec.london.kind === "daily") {
          // consecutive London dates with no gap: a drift of an hour would skip or repeat one.
          const days = dates.map(
            (date) => Date.parse(`${date}T00:00:00Z`) / 86_400_000,
          );
          for (let i = 1; i < days.length; i += 1)
            expect(days[i]! - days[i - 1]!).toBe(1);
          expect(dates.length).toBeGreaterThanOrEqual(5);
        }
      });
    },
  );
});

describe("five jobs the re-base is named against", () => {
  it("expire-trials lapses at 03:00 London on both sides of spring forward", () => {
    const spec = specFor("/api/cron/expire-trials");
    const fires = firesBetween(
      committedSchedules.get(spec.path) ?? "",
      SPRING_FORWARD.from,
      SPRING_FORWARD.to,
    ).filter((at) => cronIsDue(spec.london, at));

    // 28 March is GMT (03:00Z), 30 March is BST (02:00Z) — both read 03:00 in London.
    expect(fires).toContain("2026-03-28T03:00:00.000Z");
    expect(fires).toContain("2026-03-30T02:00:00.000Z");
    expect(fires).not.toContain("2026-03-30T03:00:00.000Z");
  });

  it("delete-account and purge-scrubbed-users keep their fifteen-minute gap through BST", () => {
    const cleanup = specFor("/api/cron/delete-account");
    const softLock = specFor("/api/cron/purge-scrubbed-users");
    const dueOn = (spec: CronSpec) =>
      firesBetween(
        committedSchedules.get(spec.path) ?? "",
        "2026-07-01T00:00:00.000Z",
        "2026-07-02T00:00:00.000Z",
      ).filter((at) => cronIsDue(spec.london, at));

    expect(dueOn(cleanup)).toEqual(["2026-07-01T01:30:00.000Z"]);
    expect(dueOn(softLock)).toEqual(["2026-07-01T01:45:00.000Z"]);
  });

  it("placement-start-sweep reads the London date, not the UTC one — in BST it fires the UTC evening before", () => {
    const spec = specFor("/api/cron/placement-start-sweep");
    const fires = firesBetween(
      committedSchedules.get(spec.path) ?? "",
      "2026-07-01T00:00:00.000Z",
      "2026-07-03T00:00:00.000Z",
    ).filter((at) => cronIsDue(spec.london, at));

    expect(fires).toEqual([
      "2026-07-01T23:15:00.000Z",
      "2026-07-02T23:15:00.000Z",
    ]);
    expect(londonWallClock(fires[0]!)).toMatchObject({
      date: "2026-07-02",
      hour: 0,
      minute: 15,
    });
  });

  it("expire-connections is never gated — an `every` cron declares no London hour for the gate to check", () => {
    const spec = specFor("/api/cron/expire-connections");

    expect(spec.london.kind).toBe("every");
    // 06:45Z in July is 07:45 London: due either way, and a handler that cares reads the London clock itself.
    expect(cronIsDue(spec.london, "2026-07-15T06:45:00.000Z" as Instant)).toBe(
      true,
    );
    expect(londonWallClock("2026-07-15T06:45:00.000Z" as Instant).hour).toBe(7);
    expect(londonWallClock("2026-07-15T21:30:00.000Z" as Instant).hour).toBe(
      22,
    );
  });
});

describe("end to end through runCron — the double fire reaches the handler once a London day", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.doMock("@/modules/config/server", () => ({
      env: { environment: "test", public: {}, server: { CRON_SECRET: SECRET } },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("@/modules/config/server");
    vi.resetModules();
  });

  const driveAcross = async (
    path: string,
    window: { from: string; to: string },
  ) => {
    const { runCron } = await import("../run-cron");
    const spec = specFor(path);
    const ranAt: string[] = [];
    const handler = async (now: Instant) => {
      ranAt.push(londonWallClock(now).date);
      return { ok: true as const, value: { handled: 1, skipped: 0 } };
    };

    for (const at of firesBetween(
      committedSchedules.get(path) ?? "",
      window.from,
      window.to,
    )) {
      vi.setSystemTime(new Date(at));
      await runCron(
        new Request(`https://example.test${path}`, {
          headers: { authorization: `Bearer ${SECRET}` },
        }),
        path,
        handler,
      );
    }
    return { ranAt, spec };
  };

  it("runs expire-trials exactly once per London day across spring forward", async () => {
    const { ranAt } = await driveAcross(
      "/api/cron/expire-trials",
      SPRING_FORWARD,
    );

    expect(ranAt).toEqual([
      "2026-03-26",
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
    ]);
  });

  it("runs expire-trials exactly once per London day across fall back", async () => {
    const { ranAt } = await driveAcross("/api/cron/expire-trials", FALL_BACK);

    expect(ranAt).toEqual([
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
  });

  it("runs placement-start-sweep exactly once per London day across fall back, midnight included", async () => {
    const { ranAt } = await driveAcross(
      "/api/cron/placement-start-sweep",
      FALL_BACK,
    );

    expect(new Set(ranAt).size).toBe(ranAt.length);
    expect(ranAt).toContain("2026-10-25");
    expect(ranAt).toContain("2026-10-26");
  });

  it("the discarded fire answers 200 with a run summary of zero and never calls the handler", async () => {
    const { runCron } = await import("../run-cron");
    const path = "/api/cron/expire-trials";
    let calls = 0;
    const handler = async () => {
      calls += 1;
      return { ok: true as const, value: { handled: 7, skipped: 0 } };
    };

    // 03:00Z on a July day is 04:00 London — the GMT candidate, an hour late.
    vi.setSystemTime(new Date("2026-07-15T03:00:00.000Z"));
    const response = await runCron(
      new Request(`https://example.test${path}`, {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
      path,
      handler,
    );

    expect(calls).toBe(0);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { handled: number; skipped: number };
    };
    expect(body.data).toEqual({ handled: 0, skipped: 0 });
  });

  it("a repeat delivery inside the same due window still reaches the handler — idempotency is the handler's contract, not the gate's", async () => {
    const { runCron } = await import("../run-cron");
    const path = "/api/cron/expire-trials";
    let calls = 0;
    const handler = async () => {
      calls += 1;
      return { ok: true as const, value: { handled: 1, skipped: 0 } };
    };
    const fire = async (iso: string) => {
      vi.setSystemTime(new Date(iso));
      await runCron(
        new Request(`https://example.test${path}`, {
          headers: { authorization: `Bearer ${SECRET}` },
        }),
        path,
        handler,
      );
    };

    await fire("2026-07-15T02:00:00.000Z");
    await fire("2026-07-15T02:00:00.000Z");

    // Two calls, deliberately: a serverless gate has no durable memory, so the guarantee the schedule gives is
    // "one *scheduled* run per London day" and the guarantee against a retry is the handler's own idempotency
    // (01 §4f, "every handler … idempotent"). Pinning it here stops a later reader assuming the gate dedupes.
    expect(calls).toBe(2);
  });
});
