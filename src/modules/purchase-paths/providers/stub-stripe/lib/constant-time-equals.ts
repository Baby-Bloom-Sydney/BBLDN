// Constant-time string compare for shared secrets (07 §5.5 layer 3, §5.4 row 4). A `===` on a secret leaks its
// prefix through timing.
//
// **Why this is pure arithmetic and not `node:crypto`.** The earlier draft hashed both sides with `createHash`
// and compared the digests with `timingSafeEqual`. That is a correct primitive and the wrong dependency *here*:
// a static `node:crypto` import in this file is the single reason `configurePurchaseProvider` could not be
// wired at boot (P1-WIRE's recorded blocker — `src/instrumentation.ts` is built for the edge runtime too,
// because `src/middleware.ts` makes one exist, and the `NEXT_RUNTIME` read that would split the boot is
// forbidden by `check:env-reads`). Nothing else under `stub-stripe/` touches a Node builtin, so removing this
// one import makes the provider runtime-agnostic and the boot wiring possible. The route layer's own copy
// (`src/app/api/_lib/constant-time-equals.ts`) runs only on the Node runtime and is deliberately left alone.
//
// **What it guarantees.** The loop runs `SECRET_MAX_LENGTH` times whatever the inputs are, so neither the
// iteration count nor the exit point depends on either string — the length signal that `timingSafeEqual`'s
// equal-length requirement is usually worked around with by hashing is closed here by a fixed window instead.
// A length mismatch is folded into the same accumulator rather than returning early. `charCodeAt` past the end
// is `NaN`, so each side is read explicitly and an absent position contributes `0` on both sides.
//
// **The bound.** A secret longer than the window would be compared on its first `SECRET_MAX_LENGTH` characters
// only, so anything longer is refused outright rather than silently truncated — on both sides, so the refusal
// itself carries no information about which side was long.
//
// GAP (recorded in the L-005 F-c PROGRESS entry): this is the second copy of the primitive — the route layer
// has its own. It belongs in `platform`, which is outside this unit's touch surface. Fold the two into one
// `platform` export when `platform` is next opened; the two now differ in mechanism as well as in home.

// Longer than any secret the env schema accepts, and a fixed cost of a few hundred integer operations.
const SECRET_MAX_LENGTH = 256;

export function constantTimeEquals(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  if (a.length > SECRET_MAX_LENGTH || b.length > SECRET_MAX_LENGTH) diff |= 1;
  for (let i = 0; i < SECRET_MAX_LENGTH; i += 1) {
    const left = i < a.length ? a.charCodeAt(i) : 0;
    const right = i < b.length ? b.charCodeAt(i) : 0;
    diff |= left ^ right;
  }
  return diff === 0;
}
