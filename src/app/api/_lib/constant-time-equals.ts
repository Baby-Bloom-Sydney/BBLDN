// Constant-time string compare for shared secrets at the route boundary (01 §4e; 07 §5.4 row 4). A `===` on a
// secret leaks its prefix through timing; `timingSafeEqual` needs equal-length buffers, so both sides are hashed
// first — which also means the comparison never reveals the secret's length.
//
// GAP (recorded in the L-005 F-c PROGRESS entry): the same nine lines exist at
// `src/modules/purchase-paths/providers/stub-stripe/lib/constant-time-equals.ts`. It belongs in `platform`,
// which is outside this unit's touch surface; fold the two into one `platform` export when `platform` is next
// opened. A module may not import from `src/app/`, and a route may not deep-import a module, so neither copy can
// reach the other today.
import { createHash, timingSafeEqual } from "node:crypto";

const DIGEST = "sha256";

export function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash(DIGEST).update(a, "utf8").digest();
  const right = createHash(DIGEST).update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}
