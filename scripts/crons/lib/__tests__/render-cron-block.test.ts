// The BST defect, pinned at the renderer. Vercel expressions are UTC only, and the inherited rule "the UTC hour
// equals the London hour" is a naive offset: it is right for the twenty-one weeks of GMT and an hour late for the
// thirty-one weeks of BST, so `trial-reminders` — declared "08:00 London morning" — delivered at 09:00 for most
// of the year. A London hour is expressible in UTC only as **both** candidate hours; the due-gate
// (`api/_lib/cron-is-due`) discards the one that is not the declared London time.
import { describe, expect, it } from "vitest";
import type { CronSpec } from "../../../../src/modules/config/types.ts";
import { renderCronBlock } from "../render-cron-block";

const spec = (london: CronSpec["london"]): CronSpec => ({
  path: "/api/cron/example",
  london,
  serves: "a test",
});

const scheduleOf = (london: CronSpec["london"]): string =>
  renderCronBlock([spec(london)])[0]!.schedule;

describe("an interval cron is untouched — it carries no London hour to be wrong about", () => {
  it("renders every-N-minutes verbatim", () => {
    expect(scheduleOf({ kind: "every", minutes: 15 })).toBe("*/15 * * * *");
  });
});

describe("a daily London time renders both candidate UTC hours", () => {
  it("covers GMT (H) and BST (H-1) for a mid-morning job", () => {
    expect(scheduleOf({ kind: "daily", hour: 8, minute: 0 })).toBe(
      "0 7,8 * * *",
    );
  });

  it("wraps the BST candidate into the previous UTC day for a midnight job", () => {
    expect(scheduleOf({ kind: "daily", hour: 0, minute: 5 })).toBe(
      "5 0,23 * * *",
    );
  });

  it("keeps the hour list ascending so the expression reads in clock order", () => {
    expect(scheduleOf({ kind: "daily", hour: 3, minute: 15 })).toBe(
      "15 2,3 * * *",
    );
  });
});

describe("a weekly London time renders both candidate UTC hours on the declared weekday", () => {
  it("covers GMT and BST for Monday 06:00", () => {
    expect(scheduleOf({ kind: "weekly", weekday: 1, hour: 6, minute: 0 })).toBe(
      "0 5,6 * * 1",
    );
  });
});

describe("the two London hours that cannot be scheduled are refused, not silently mis-scheduled", () => {
  it("refuses 01:xx daily — the hour does not exist on the spring-forward day and happens twice on the fall-back day", () => {
    expect(() => scheduleOf({ kind: "daily", hour: 1, minute: 0 })).toThrow(
      /01/u,
    );
  });

  it("refuses 01:xx weekly for the same reason", () => {
    expect(() =>
      scheduleOf({ kind: "weekly", weekday: 3, hour: 1, minute: 30 }),
    ).toThrow(/01/u);
  });

  it("refuses 00:xx weekly — the BST candidate falls on the previous weekday", () => {
    expect(() =>
      scheduleOf({ kind: "weekly", weekday: 1, hour: 0, minute: 5 }),
    ).toThrow(/weekday/u);
  });
});

describe("no cron that ships is declared at an unschedulable London hour", () => {
  it("renders the whole committed list without throwing", async () => {
    const { CRONS } = await import("../../../../src/modules/config/crons.ts");

    expect(() => renderCronBlock(CRONS)).not.toThrow();
    expect(renderCronBlock(CRONS)).toHaveLength(CRONS.length);
  });
});
