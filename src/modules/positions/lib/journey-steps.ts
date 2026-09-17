// 04 §7.1 + 03 §2.3 — the parent rail as a read model over the stages (P-2, ADR-002). Pure: no lazy sweep, no
// write (ADR-070). Row 9 (ended / closed) **replaces** rows 1–8; otherwise every row is present, because a step
// is never hidden and never reads "waiting for nannies" (04 §7.1 rule).
//
// What this unit composes: row 1 from the position's stage, row 2 from the pre-check lever, row 9 from the
// terminal stages. **Row 3 arrives whole from the `JourneyRowSource` port** — its words are `call-layer`'s
// `callRailLine` and `positions` may never import that module (fix: A-2 / R2). Rows 4–8 read `pending` here and
// are `1f` / `1g` / `1h`'s: 4 · 5 need the connection stages, 6 the placement, 7 `payments.getAccess`, 8 the
// child-linking read model — none of which exists yet, and inventing their states would put a made-up journey on
// a parent's dashboard.
import type { JourneyStep } from "@/modules/shared-types";
import type { PositionRecord } from "../types";

const LABELS = Object.freeze({
  1: "Matches",
  2: "Nannies pre-checked",
  3: "Introduction call",
  4: "Meetings",
  6: "Hire",
  7: "Your app",
  9: "Ended",
});

const step = (
  row: JourneyStep["row"],
  label: string,
  state: JourneyStep["state"],
  detail?: string,
): JourneyStep =>
  Object.freeze({
    row,
    label,
    state,
    ...(detail === undefined ? {} : { detail }),
  });

/** Row 1 — "Matched — position created": done once the position is `OPEN` or beyond (03 §2.3 row 1). */
const rowOne = (record: PositionRecord | null): JourneyStep =>
  record === null || record.stage === "DRAFT"
    ? step(
        1,
        LABELS[1],
        "in-motion",
        "Create your position to connect with nannies",
      )
    : step(1, LABELS[1], "done", "Matched — your top nannies are lined up");

/**
 * Row 2 — "Nannies pre-checked": in motion from `precheck.fired`, ✓ on the first `precheck.responded`
 * (03 §2.3 row 2). The ✓ half is K-2's and lands with `1g`; until then the row stays in motion once fired,
 * which is what the matchmaker chases (04 §7.1 "A chases").
 */
const rowTwo = (record: PositionRecord | null): JourneyStep =>
  record?.precheck == null
    ? step(2, LABELS[2], "pending")
    : step(
        2,
        LABELS[2],
        "in-motion",
        "We're checking who's available and keen",
      );

const REMAINING: ReadonlyArray<readonly [JourneyStep["row"], string]> =
  Object.freeze([
    [4, LABELS[4]],
    [5, LABELS[4]],
    [6, LABELS[6]],
    [7, LABELS[7]],
    [8, LABELS[7]],
  ] as const);

export function journeySteps(
  record: PositionRecord | null,
  callRow: JourneyStep | null,
): ReadonlyArray<JourneyStep> {
  if (
    record !== null &&
    (record.stage === "ENDED" || record.stage === "CLOSED")
  )
    return Object.freeze([
      step(9, LABELS[9], "done", record.endReason ?? record.closeReason),
    ]);
  return Object.freeze([
    rowOne(record),
    rowTwo(record),
    callRow ?? step(3, LABELS[3], "pending"),
    ...REMAINING.map(([row, label]) => step(row, label, "pending")),
  ]);
}
