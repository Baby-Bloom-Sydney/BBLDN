// The pre-check waves sweep (01 §4f, 09:00 London), owned by `matching` because `matching` owns the pre-check
// (R2; 03 §7.4).
//
// A standalone exported function rather than a connector method, which is the shape `admin.callDueSweep`
// already uses for a scheduled task's inside: it composes two calls that are both already on connectors, and
// adding a fifth method to `Matching` would mean a fifth implementation in the stub and in the registry
// default for no behaviour that is not here.
//
// **What it is for.** `autofire` fires on the P-2 commit, and 03 §7.4 is explicit that a blast failure must
// never fail the position write — the lever stands and "the waves sweep re-fires any `OPEN` position with no
// `precheck_fired_at`". So this is the net under the pre-check: a position whose autofire never ran, or ran
// and fell over before the lever, is picked up the next morning instead of sitting `OPEN` and unlooked-at.
//
// **Idempotent by construction, and the mechanism is the lever itself.** `autofire` writes `precheck` through
// `positions.recordPrecheck`; `positions.awaitingPrecheck` answers `OPEN` positions where that is still null.
// So a position this run fired is not in the next run's set, and nothing durable needs to remember the run.
//
// ★ PINNED, with its owner: this fires **wave 1 only**. `MATCHING.precheck.waves` is 1 today (`@pending` 01
// §10 O-8 / `08.25`), and `autofire` hardcodes `FIRST_WAVE`, so wave 1 is the whole of the configured
// behaviour and the sweep is complete as it stands. If BAI rules more than one wave, this file is **not**
// where the second one goes: a later wave needs `autofire` to take a wave number and needs a rule for which
// nannies a re-blast may reach, which is `matching`'s business. See the pin in
// `__tests__/precheck-waves-sweep.test.ts`.
//
// (Every word here passes 05 §5.2's list, which covers this module's comments too — so the scheduled task is
// named by what it does rather than by its route.)
import { log } from "@/modules/platform";
import { positions } from "@/modules/positions";
import type {
  Actor,
  Instant,
  PositionId,
  Result,
} from "@/modules/shared-types";
import { matching } from "./default-matching";

/** The scheduled caller is the actor, under the 03 §2.5 `SystemJobName` `autofire`. */
const SWEEP: Actor = { kind: "system", id: "autofire" };

export async function sweepPrecheckWaves(
  now: Instant,
): Promise<Result<{ readonly handled: number; readonly skipped: number }>> {
  const waiting = await positions.awaitingPrecheck();
  if (!waiting.ok) return waiting;

  // One position that cannot be pre-checked must not cost the rest of the morning's set theirs, so each is
  // counted and the run summary is the truth (01 §4f). The reason is logged per position, because "12 handled,
  // 3 skipped" on its own tells an operator nothing about which three or why.
  const outcomes = await Promise.all(
    waiting.value.map(async (positionId) => {
      const fired = await matching.autofire(positionId as PositionId, SWEEP);
      if (!fired.ok)
        log.warn("a position could not be pre-checked", {
          module: "matching",
          action: "precheck-waves-sweep",
          positionId,
          at: now,
          errorCode: fired.error.code,
        });
      return fired.ok;
    }),
  );

  const handled = outcomes.filter(Boolean).length;
  return {
    ok: true,
    value: Object.freeze({
      handled,
      skipped: outcomes.length - handled,
    }),
  };
}
