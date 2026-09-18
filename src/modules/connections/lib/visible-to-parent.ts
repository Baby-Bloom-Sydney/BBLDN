// ★ ADR-158 (2) — **the silent hold's read side**, and the one place it is enforced.
//
// A connection made for a nanny below L4 is written `held_for_verification` (02 §4.2 row 7, R-14: "held rows
// withhold parent notification until L4"). `0016`'s parent SELECT policy hides such a row from a query run **as
// the parent**, and `int.rpc-0024` proves it — but that is the second gate, not the gate: `dbConnectionStore`
// reads at `{ scope: "service" }` by design (`0007` gives `connection_requests` no client write policy and the
// cascades run as `system`, with no session to read under), so RLS never fires on the application's own reads.
// **The application is what hides a held row, and this is where it does it.**
//
// It is a filter at the two **parent-facing** consumption points — S-P-08's cards and the rail's rows 4-6 — and
// deliberately not inside `connections.forParent`, because the machinery must still see held rows: P-7's close
// cascade closes them with everything else, and K-1's duplicate and pending-cap checks count them. A filter one
// level lower would make a held connection un-closeable and let a parent exceed her pending cap.
//
// **Stage-blind on purpose.** The hold is not about where the connection has got to; it is about whether this
// nanny may be put in front of this family at all yet. So a held row is hidden at every stage, terminal ones
// included, until `sync_nanny_verification_state()` clears the pair at L4 — at which point it appears with its
// history intact.
//
// **Absent is not held.** A summary with no flag is shown: that is every row written before `0024`, and every
// double that does not model the pair.
import type { ConnectionSummary } from "../types";

export function visibleToParent(
  summaries: ReadonlyArray<ConnectionSummary>,
): ReadonlyArray<ConnectionSummary> {
  return Object.freeze(
    summaries.filter((row) => row.heldForVerification !== true),
  );
}
