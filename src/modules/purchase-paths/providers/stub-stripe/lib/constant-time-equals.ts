// Constant-time string compare for shared secrets (07 §5.5 layer 3, §5.4 row 4). A `===` on a secret leaks its
// prefix through timing; `timingSafeEqual` needs equal-length buffers, so the length is folded in by hashing both
// sides first — that also means the comparison never reveals the secret's length.
//
// GAP (recorded in the L-005 F-c PROGRESS entry): this is the second copy of a nine-line primitive — the route
// layer has its own at `src/app/api/_lib/constant-time-equals.ts`. It belongs in `platform`, which is outside
// this unit's touch surface. Fold the two into one `platform` export when `platform` is next opened.
import { createHash, timingSafeEqual } from "node:crypto";

const DIGEST = "sha256";

export function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash(DIGEST).update(a, "utf8").digest();
  const right = createHash(DIGEST).update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}
