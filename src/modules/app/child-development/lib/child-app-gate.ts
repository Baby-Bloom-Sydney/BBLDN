// `07.59` / `07.09` — the gate every child-development surface asks before it renders (04 §6.2 S-P-13).
//
// It is three-valued, and that is the only interesting thing about it. `accessGate.hasAccess` fails closed by
// **carrying `payments`' error** rather than returning a defaulted `{ open: false }` (`1h`), so a caller can
// tell "the app is shut for this family" from "we could not find out" — and a caller that flattens the two
// into a boolean throws that away at the last possible moment, which is exactly where it matters:
//
//   open    → render the child's pages.
//   closed  → the paywall, in guide voice (04 §8).
//   unknown → "we couldn't check", and **no paywall**. A family that has paid, shown a demand for money
//             because the database blinked, is the single worst thing this surface can do.
//
// The decision arrives structurally (`AccessFacts`) rather than as an import: 01 §2.3 lets nothing but
// `access-gate` import `access-gate`, so the route reads the gate and hands two fields down.
import type { AccessFacts } from "../../child-linking";

export type ChildAppGate =
  | { readonly kind: "open" }
  | { readonly kind: "closed"; readonly reason: string }
  | { readonly kind: "unknown" };

export function childAppGate(access: AccessFacts | null): ChildAppGate {
  if (access === null) return { kind: "unknown" };
  return access.open
    ? { kind: "open" }
    : { kind: "closed", reason: access.reason };
}
