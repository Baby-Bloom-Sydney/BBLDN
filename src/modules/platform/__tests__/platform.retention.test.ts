// `retention-sweep`'s inside — 07 §6.2, the third retention job (L-009 `3h`; `3g`'s Q-1).
//
// What is worth driving at this layer is everything the SQL cannot decide for itself:
//
//   1. **The schedule is the caller's, and the job dispatches only what the schedule gives a treatment.** A
//      class marked `deferred` (07 §6.2's ★ windows, BAI's to confirm) or `none` must never reach the store: the
//      migration raises on one, and a sweep that raised on nine of its seventeen classes every night would be
//      indistinguishable from a broken job.
//   2. **One class failing does not end the run.** ADR-182's raised refusal is per class, and the whole point of
//      one transaction per class is that the other sixteen still get swept.
//   3. **The counts mean what the cron line says they mean**, including `capped` — "500 removed, more waiting"
//      and "500 removed, that was all" are the same number and different states.
import { describe, expect, it, vi } from "vitest";
import { RETENTION } from "@/modules/config";
import { createPrivacy, retentionSpecs } from "@/modules/platform";
import type { PrivacyStore } from "@/modules/platform";
import type { Instant } from "@/modules/shared-types";
import { memoryPrivacyStore } from "../privacy/privacy.stub";

const NOW = "2026-09-20T02:00:00.000Z" as Instant;

/** Classes the config gives a real treatment — the only ones that may ever reach the store. */
const ACTING = RETENTION.schedule
  .filter(
    (row) =>
      row.treatment.kind === "delete" || row.treatment.kind === "null-columns",
  )
  .map((row) => row.class);

const withStore = (store: PrivacyStore) => createPrivacy({ store });

describe("retentionSpecs — the schedule in the shape 0031 reads", () => {
  it("offers every acting class, and no class the config defers", () => {
    expect(retentionSpecs().map((spec) => spec.class)).toEqual(ACTING);
  });

  it("hands each class its window and its anchors unchanged", () => {
    const money = retentionSpecs().find((spec) => spec.class === "money");
    const source = RETENTION.schedule.find((row) => row.class === "money");
    expect(money?.spec.window).toEqual(source?.window);
    expect(money?.spec.anchors).toEqual(source?.anchors);
  });

  it("never invents a window of its own", () => {
    for (const spec of retentionSpecs())
      expect(spec.spec.window).not.toBeNull();
  });
});

describe("privacy.sweepRetention — 07 §6.2's daily pass", () => {
  it("★ calls the store once per acting class, in the schedule's order", async () => {
    const seen: string[] = [];
    const store = memoryPrivacyStore();
    const spy = vi.fn(async (input: { readonly class: string }) => {
      seen.push(input.class);
      return {
        ok: true as const,
        value: { class: input.class, removed: 0, nulled: 0, capped: false },
      };
    });

    await withStore({ ...store, sweepRetentionClass: spy }).sweepRetention(NOW);

    expect(seen).toEqual(ACTING);
  });

  it("★ never dispatches a class the config defers or marks `none`", async () => {
    const deferred = RETENTION.schedule
      .filter(
        (row) =>
          row.treatment.kind === "deferred" || row.treatment.kind === "none",
      )
      .map((row) => row.class);
    const seen: string[] = [];
    const store = memoryPrivacyStore();

    await withStore({
      ...store,
      sweepRetentionClass: async (input) => {
        seen.push(input.class);
        return {
          ok: true as const,
          value: { class: input.class, removed: 0, nulled: 0, capped: false },
        };
      },
    }).sweepRetention(NOW);

    expect(deferred.length).toBeGreaterThan(0);
    expect(seen.filter((name) => deferred.includes(name))).toEqual([]);
  });

  it("adds removed and nulled into `handled`, and counts a deferred class as skipped", async () => {
    const store = memoryPrivacyStore();

    const run = await withStore({
      ...store,
      sweepRetentionClass: async (input) => ({
        ok: true as const,
        value: { class: input.class, removed: 2, nulled: 3, capped: false },
      }),
    }).sweepRetention(NOW);

    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.value.handled).toBe(ACTING.length * 5);
    expect(run.value.skipped).toBe(RETENTION.schedule.length - ACTING.length);
  });

  it("★ one class raising does not end the run — the other classes are still swept", async () => {
    const seen: string[] = [];
    const store = memoryPrivacyStore();

    const run = await withStore({
      ...store,
      sweepRetentionClass: async (input) => {
        seen.push(input.class);
        if (input.class === ACTING[0])
          return {
            ok: false as const,
            error: {
              code: "CONFLICT" as const,
              message: "busy",
              details: { reason: "retry" as const },
            },
          };
        return {
          ok: true as const,
          value: { class: input.class, removed: 1, nulled: 0, capped: false },
        };
      },
    }).sweepRetention(NOW);

    expect(seen).toEqual(ACTING);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.value.handled).toBe(ACTING.length - 1);
    expect(run.value.failed).toBe(1);
  });

  it("★ reports a capped class, because `more waiting` is not `that was all`", async () => {
    const store = memoryPrivacyStore();

    const run = await withStore({
      ...store,
      sweepRetentionClass: async (input) => ({
        ok: true as const,
        value: {
          class: input.class,
          removed: RETENTION.batchLimit,
          nulled: 0,
          capped: true,
        },
      }),
    }).sweepRetention(NOW);

    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.value.capped).toEqual(ACTING);
  });

  it("★ emits `retention.applied` once per class that acted, and never for one that did not", async () => {
    // 07 §6.2's own sentence: the sweep "emits `retention.applied` { table, count }". A class that removed and
    // nulled nothing has nothing to record, and an event saying so would make the trail say work happened.
    const emitted: ReadonlyArray<unknown>[] = [];
    const store = memoryPrivacyStore();
    let n = 0;

    await createPrivacy({
      store: {
        ...store,
        sweepRetentionClass: async (input) => {
          n += 1;
          return {
            ok: true as const,
            value: {
              class: input.class,
              removed: n === 1 ? 3 : 0,
              nulled: 0,
              capped: false,
            },
          };
        },
      },
      onSwept: async (input) => {
        emitted.push([input.class, input.rowCount]);
      },
    }).sweepRetention(NOW);

    expect(emitted).toEqual([[ACTING[0], 3]]);
  });

  it("passes the configured batch limit rather than an unbounded one", async () => {
    const limits: number[] = [];
    const store = memoryPrivacyStore();

    await withStore({
      ...store,
      sweepRetentionClass: async (input) => {
        limits.push(input.limit);
        return {
          ok: true as const,
          value: { class: input.class, removed: 0, nulled: 0, capped: false },
        };
      },
    }).sweepRetention(NOW);

    expect(new Set(limits)).toEqual(new Set([RETENTION.batchLimit]));
  });
});
