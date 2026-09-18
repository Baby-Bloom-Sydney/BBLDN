// `platform/privacy.purgeScrubbedUsers` — 07 §6.1 step 6's second half (L-009 `3g`).
//
// The claims here are the ones the database cannot make on its own:
//
//   · **the windows come from `LEGAL.erasureRetains`, whole** — every class, with its months and its anchor. The
//     ruling this unit carries is that the job reads ADR-179's list rather than a second copy of the dates, and
//     a projection that quietly dropped a class would leave `0030` raising in production with nothing in CI to
//     have caught it;
//   · **it never pushes** — a subject a window still holds is counted and left, and `retained` is the number an
//     operator reads;
//   · **a raised refusal is counted with the retained rather than lost**, because from an operator's seat both
//     mean "still here", and a purge that silently dropped a contended subject would under-report for ever.
import { describe, expect, it } from "vitest";
import { LEGAL, SECURITY } from "@/modules/config";
import {
  createPrivacy,
  memoryPrivacyStore,
  purgeWindows,
} from "@/modules/platform";
import type { Instant } from "@/modules/shared-types";

const NOW = "2027-01-01T00:00:00.000Z" as Instant;

describe("purgeWindows — ADR-179's list, projected and not re-derived", () => {
  it("★ names every class in LEGAL.erasureRetains, and only those", () => {
    expect(Object.keys(purgeWindows()).sort()).toEqual(
      LEGAL.erasureRetains.map((row) => row.class).sort(),
    );
  });

  it("★ carries each class's months AND the anchor it runs from", () => {
    for (const row of LEGAL.erasureRetains) {
      expect(purgeWindows()[row.class]).toEqual({
        months: row.windowMonths,
        from: row.from,
      });
    }
  });

  it("★ money runs from the last transaction and consent from the scrub — they are not the same anchor", () => {
    expect(purgeWindows().money.from).toBe("last-activity");
    expect(purgeWindows().consent.from).toBe("scrub");
  });

  it("the windows are the config's, not a literal — six years, expressed once", () => {
    expect(purgeWindows().money.months).toBe(
      SECURITY.retention.moneyYears * 12,
    );
    expect(purgeWindows().consent.months).toBe(
      SECURITY.retention.consentYearsAfterScrub * 12,
    );
  });
});

describe("purgeScrubbedUsers — the sweep", () => {
  it("does nothing when nobody has been erased", async () => {
    const privacy = createPrivacy({ store: memoryPrivacyStore() });

    const run = await privacy.purgeScrubbedUsers(NOW);

    expect(run.ok && run.value).toEqual({ purged: 0, retained: 0 });
  });

  it("★ purges a subject nothing holds", async () => {
    const store = memoryPrivacyStore();
    const privacy = createPrivacy({ store });
    await store.runErasure({
      subjectUserId: "u-1",
      requestId: "r-1",
      deletedObjects: [],
    });

    const run = await privacy.purgeScrubbedUsers(NOW);

    expect(run.ok && run.value).toEqual({ purged: 1, retained: 0 });
  });

  it("★ counts a subject a window still holds as RETAINED, and purges nothing", async () => {
    const store = memoryPrivacyStore({ retain: { "u-1": "money" } });
    const privacy = createPrivacy({ store });
    await store.runErasure({
      subjectUserId: "u-1",
      requestId: "r-1",
      deletedObjects: [],
    });

    const run = await privacy.purgeScrubbedUsers(NOW);

    expect(run.ok && run.value).toEqual({ purged: 0, retained: 1 });
  });

  it("★ is idempotent: a second run has nothing left to do", async () => {
    const store = memoryPrivacyStore();
    const privacy = createPrivacy({ store });
    await store.runErasure({
      subjectUserId: "u-1",
      requestId: "r-1",
      deletedObjects: [],
    });
    expect((await privacy.purgeScrubbedUsers(NOW)).ok).toBe(true);

    const second = await privacy.purgeScrubbedUsers(NOW);

    expect(second.ok && second.value).toEqual({ purged: 0, retained: 0 });
  });

  it("★ counts a RAISED refusal with the retained rather than losing it", async () => {
    const store = memoryPrivacyStore();
    await store.runErasure({
      subjectUserId: "u-1",
      requestId: "r-1",
      deletedObjects: [],
    });
    const privacy = createPrivacy({
      store: {
        ...store,
        purgeSubject: async () => ({
          ok: false,
          error: {
            code: "CONFLICT",
            message: "later",
            details: { reason: "retry" as const },
          },
        }),
      },
    });

    const run = await privacy.purgeScrubbedUsers(NOW);

    expect(run.ok && run.value).toEqual({ purged: 0, retained: 1 });
  });

  it("★ a failed candidate read fails the whole run — a clean partial sweep is worse than no run", async () => {
    const privacy = createPrivacy({
      store: {
        ...memoryPrivacyStore(),
        listPurgeCandidates: async () => ({
          ok: false,
          error: { code: "INTERNAL", message: "the read failed" },
        }),
      },
    });

    expect((await privacy.purgeScrubbedUsers(NOW)).ok).toBe(false);
  });

  it("★ hands the whole window list across — a store given a short one refuses", async () => {
    // This is ADR-179's rule at the seam: `0030` raises when a class has no window, and the stub models that.
    // If `purgeWindows()` ever dropped a class, this is where it would be caught rather than in production.
    const store = memoryPrivacyStore();
    await store.runErasure({
      subjectUserId: "u-1",
      requestId: "r-1",
      deletedObjects: [],
    });
    const short = await store.purgeSubject({
      subjectUserId: "u-1",
      windows: { money: { months: 72, from: "last-activity" } },
    });

    expect(short.ok).toBe(false);
    expect(
      (
        await store.purgeSubject({
          subjectUserId: "u-1",
          windows: purgeWindows(),
        })
      ).ok,
    ).toBe(true);
  });
});
