// 07 §6.2's table as a value (ADR-179, widened from `LEGAL.erasureRetains` to the whole schedule; L-009 `3h`).
//
// The claims this merge rests on, each executable:
//   1. **Every one of 07 §6.2's seventeen rows has an entry.** A row with no entry is the state ADR-179 calls a
//      gate failure — `retention-sweep` would silently do nothing about it and nobody would learn.
//   2. **No window is typed here.** Every number comes from `SECURITY.retention`, which is where 07 §6.2's
//      numbers already live; a schedule that restated one would be a second home for a legal fact.
//   3. **A class that does nothing says why, and who owns the doing.** `deferred` and `none` are answers, not
//      absences: each names its reason, and `deferred` names its owner.
//   4. **A safeguarding table is never deleted by the clock** (the unit's ruling 3). Row 4's own entry is the
//      only place safeguarding is spoken about, and it removes nothing.
//   5. **The three classes an erasure keeps line up with their rows in the schedule**, so the sentence a person
//      reads before she confirms and the job that eventually removes the row cannot disagree about the window.
import { describe, expect, it } from "vitest";
import { LEGAL, RETENTION, SECURITY } from "@/modules/config";

/** 07 §6.2's table is rows 1…17. Not derived from the value under test — that would prove nothing. */
const SPEC_ROWS = Array.from({ length: 17 }, (_, i) => i + 1);

/** The three tables ADR-170 puts beyond the reach of any timer without an explicit class of their own. */
const SAFEGUARDING_TABLES = [
  "verifications",
  "vetting_submissions",
  "nanny_suspension_lifts",
];

describe("config/retention — 07 §6.2 as a machine-readable schedule (ADR-179)", () => {
  it("has at least one entry for every one of the seventeen rows", () => {
    const covered = new Set(RETENTION.schedule.map((row) => row.specRow));
    expect([...SPEC_ROWS].filter((row) => !covered.has(row))).toEqual([]);
  });

  it("names every class exactly once", () => {
    const names = RETENTION.schedule.map((row) => row.class);
    expect(names.length).toBe(new Set(names).size);
  });

  it("takes every window from SECURITY.retention rather than typing one", () => {
    const window = (name: string) =>
      RETENTION.schedule.find((row) => row.class === name)?.window;
    expect(window("money")).toEqual({
      months: SECURITY.retention.moneyYears * 12,
    });
    expect(window("consent")).toEqual({
      months: SECURITY.retention.consentYearsAfterScrub * 12,
    });
    expect(window("email-bodies")).toEqual({
      days: SECURITY.retention.emailBodyDays,
    });
    expect(window("cookie-consent")).toEqual({
      months: SECURITY.retention.cookieConsentRecordMonths,
    });
    expect(window("events-identifiers")).toEqual({
      months: SECURITY.retention.eventsFullRowMonths,
    });
  });

  it("gives every acting class an anchor, a target and — where it nulls — the columns", () => {
    for (const row of RETENTION.schedule) {
      if (row.treatment.kind === "none" || row.treatment.kind === "deferred")
        continue;
      expect(row.window, `${row.class} has no window`).not.toBeNull();
      expect(row.anchors.length, `${row.class} has no anchor`).toBeGreaterThan(
        0,
      );
      expect(row.targets.length, `${row.class} has no target`).toBeGreaterThan(
        0,
      );
      if (row.treatment.kind === "null-columns")
        expect(
          row.treatment.columns.length,
          `${row.class} nulls nothing`,
        ).toBeGreaterThan(0);
    }
  });

  it("makes every non-acting class say why, and every deferred one say who", () => {
    for (const row of RETENTION.schedule) {
      if (row.treatment.kind === "none")
        expect(row.treatment.because.length).toBeGreaterThan(20);
      if (row.treatment.kind === "deferred") {
        expect(row.treatment.because.length).toBeGreaterThan(20);
        expect(row.treatment.owner.length).toBeGreaterThan(0);
      }
    }
  });

  it("never lets the clock delete a safeguarding table, and speaks about them only at row 4", () => {
    for (const row of RETENTION.schedule) {
      const safeguarding = row.targets.filter((table) =>
        SAFEGUARDING_TABLES.includes(table),
      );
      if (safeguarding.length === 0) continue;
      expect(
        row.treatment.kind,
        `${row.class} deletes ${safeguarding.join(", ")}`,
      ).not.toBe("delete");
    }
    const rowFour = RETENTION.schedule.filter((row) => row.specRow === 4);
    expect(rowFour.length).toBeGreaterThan(0);
    for (const row of rowFour) expect(row.treatment.kind).not.toBe("delete");
  });

  it("agrees with LEGAL.erasureRetains about the window of every class an erasure keeps", () => {
    for (const retained of LEGAL.erasureRetains) {
      const scheduled = RETENTION.schedule.find(
        (row) => row.class === retained.class,
      );
      expect(
        scheduled,
        `${retained.class} has no schedule entry`,
      ).toBeDefined();
      expect(scheduled?.specRow).toBe(retained.specRow);
      if (scheduled?.window !== null && scheduled?.window !== undefined)
        expect(scheduled.window).toEqual({ months: retained.windowMonths });
    }
  });

  it("anchors consent on the scrub and money on the last transaction, as 07 §6.2 does", () => {
    const consent = RETENTION.schedule.find((row) => row.class === "consent");
    expect(consent?.anchors.map((a) => a.table)).toEqual([
      "account_erasure_requests",
    ]);
    const money = RETENTION.schedule.find((row) => row.class === "money");
    expect(money?.anchors.map((a) => a.table)).not.toContain(
      "account_erasure_requests",
    );
    expect(money?.anchors.length).toBeGreaterThan(1);
  });

  it("caps a batch, so a first run on a full table cannot run away", () => {
    expect(RETENTION.batchLimit).toBeGreaterThan(0);
    expect(RETENTION.batchLimit).toBeLessThanOrEqual(10_000);
  });
});
