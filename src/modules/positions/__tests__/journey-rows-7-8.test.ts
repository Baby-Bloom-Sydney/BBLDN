// Rail rows 7 and 8 (04 §7.1; `1i`). The rows themselves, and the two rules that shape them.
import { describe, expect, it } from "vitest";
import type { AppRailFacts } from "../lib/journey-rows-4-to-8";
import { journeyRows4to8 } from "../lib/journey-rows-4-to-8";

const LABELS = { meetings: "Meetings", hire: "Hire", app: "Your app" } as const;

const rows = (app?: AppRailFacts) =>
  journeyRows4to8({
    connections: [],
    placement: null,
    labels: LABELS,
    ...(app === undefined ? {} : { app }),
  });

const rowSeven = (app?: AppRailFacts) => rows(app)[3];
const rowEight = (app?: AppRailFacts) => rows(app)[4];

describe("row 7 — Your app (04 §7.1)", () => {
  it("reads `pending` when nobody asked, exactly as it did before `1i`", () => {
    expect(rowSeven()).toEqual({ row: 7, label: "Your app", state: "pending" });
  });

  it("a paid deposit opens nothing, and the row must not imply it did (ADR-097)", () => {
    const step = rowSeven({ standing: "deposit-paid", open: false });

    expect(step?.state).toBe("in-motion");
    expect(step?.detail).toContain("holding your place");
    expect(step?.detail).toContain("the day your nanny starts");
  });

  it("a placed family's app is on, and the one date it carries is when the amount falls due (ADR-094)", () => {
    const step = rowSeven({
      standing: "placed",
      open: true,
      paymentDueAt: "2026-10-01T09:00:00.000Z",
    });

    expect(step?.state).toBe("in-motion");
    expect(step?.detail).toContain("Your app is on");
    expect(step?.detail).toContain("1 October");
  });

  it("★ the trial row carries NO day count — 04 §3's carried ruling beats §7.1's own line", () => {
    // 04 §7.1 row 7 gives the line as "Your app is open — {n} days"; 04 §3 says of the same state "no in-app
    // countdown banner (ruling carried)", and the standing memory rule is the same. A number on the rail is on
    // every dashboard load, which is more ambient than a banner. The ruling wins; the omission is pinned here
    // so a later edit that "restores" the line has to argue with this test. Owner: 04 §7.1.
    const step = rowSeven({ standing: "trial", open: true });

    expect(step?.detail).toBe("Your app is open");
    expect(step?.detail).not.toMatch(/\d/);
  });

  it("an admin's off-toggle takes the row back to pending, whatever was paid (ADR-093)", () => {
    expect(rowSeven({ standing: "toggled", open: false })?.state).toBe(
      "pending",
    );
    expect(rowSeven({ standing: "toggled", open: true })?.state).toBe("done");
  });

  it("is done once the bundle is paid", () => {
    expect(rowSeven({ standing: "paid-in-full", open: true })?.state).toBe(
      "done",
    );
    expect(rowSeven({ standing: "active", open: true })?.state).toBe("done");
  });
});

describe("row 8 — family + nanny in (04 §7.1 / §7.2)", () => {
  const base = { standing: "trial", open: true } as const;

  it("is pending — never hidden, never a waiting room — until the family has a child", () => {
    const step = rowEight({
      ...base,
      link: { hasChild: false, invitePending: false, nannyLinked: false },
    });

    expect(step).toEqual({ row: 8, label: "Your app", state: "pending" });
  });

  it("asks for the share once there is a child and no nanny", () => {
    const step = rowEight({
      ...base,
      link: { hasChild: true, invitePending: false, nannyLinked: false },
    });

    expect(step?.state).toBe("in-motion");
    expect(step?.detail).toBe("Share your app with your nanny");
  });

  it("says the link is out while an invite is pending", () => {
    const step = rowEight({
      ...base,
      link: { hasChild: true, invitePending: true, nannyLinked: false },
    });

    expect(step?.detail).toBe("Your nanny's link is out");
  });

  it("is done in 04 §7.1's own words once the nanny is linked", () => {
    const step = rowEight({
      ...base,
      link: { hasChild: true, invitePending: false, nannyLinked: true },
    });

    expect(step?.state).toBe("done");
    expect(step?.detail).toBe("Your app — family and nanny in");
  });
});

describe("rows 4-6 are untouched by `1i`", () => {
  it("still compose without any app facts at all", () => {
    expect(rows().map((step) => step.row)).toEqual([4, 5, 6, 7, 8]);
  });
});
