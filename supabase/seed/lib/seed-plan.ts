// What the seed is *for*, in one object: **08 §3's nanny-supply question in miniature.**
//
// 08 §3.4 fixes the launch gate at 25 verified nannies, and then says the number that actually decides
// anything is the **per-area** floor — "twenty-five verified nannies all in one borough is zero supply for a
// parent in another". So the seed is shaped the same way: a pool spread across several real areas, sized so
// that a quick match in a seeded area returns a full set (`MATCHING.quickMatch.topCount`) rather than one
// lonely card, plus one nanny in every state the admin queue and the level model have to tell apart.
//
// The pool floor is `MATCHING.minVerificationLevel` (L3), not L4: L3 is what the product calls "in the pool",
// and a seed that made everybody L4 would never exercise the silent hold, which is the single most likely
// launch-week collision (08 §3.4).
import { MATCHING } from "../../../src/modules/config/matching.ts";
import type { NannyState, SeedArea, SeedPlan } from "./types.ts";

/** One per state the queue and the level model must tell apart (`int.seed` asserts each is reachable). */
const STATES: ReadonlyArray<NannyState> = Object.freeze([
  "submitted",
  "needs-admin",
  "level-2",
  "level-3",
  "level-4",
  "barred",
  "held",
]);

export function seedPlan(areas: ReadonlyArray<SeedArea>): SeedPlan {
  return Object.freeze({
    areas: Object.freeze([...areas]),
    // a quick match that returns a full top-N proves the read; anything less proves only that it did not throw
    poolPerArea: MATCHING.quickMatch.topCount + 2,
    // enough at L4 to exercise the Update Service road and the hold release, not so many that L3 is rare
    poolAtL4: 1,
    states: STATES,
  });
}
