// 04 §7.1 + 03 §2.3 — the parent rail as a read model over the stages (P-2, ADR-002). Pure: no lazy sweep, no
// write (ADR-070). Row 9 (ended / closed) **replaces** rows 1–8; otherwise every row is present, because a step
// is never hidden and never reads "waiting for nannies" (04 §7.1 rule).
//
// What this unit composes: row 1 from the position's stage, row 2 from the pre-check lever, row 9 from the
// terminal stages. **Row 3 arrives whole from the `JourneyRowSource` port** — its words are `call-layer`'s
// `callRailLine` and `positions` may never import that module (fix: A-2 / R2).
//
// `1g`: rows 4, 5 and 6 are real — `journey-rows-4-to-8.ts` derives them from the connection stages and the
// placement, both of which `positions` may read (01 §2.3). `1i`: rows 7 and 8 are real too, from facts handed
// in on `rest.app` rather than read, because `positions` may import neither `payments` nor `app`. With no facts
// supplied they still read `pending` — which is the honest answer when nobody asked, not a made-up journey.
import type { ConnectionSummary } from "@/modules/connections";
import type { PlacementRead } from "@/modules/placements";
import type { JourneyStep } from "@/modules/shared-types";
import type { PositionRecord } from "../types";
import { journeyRows4to8 } from "./journey-rows-4-to-8";
import type { AppRailFacts } from "./journey-rows-4-to-8";

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

const RAIL_LABELS = Object.freeze({
  meetings: LABELS[4],
  hire: LABELS[6],
  app: LABELS[7],
});

export function journeySteps(
  record: PositionRecord | null,
  callRow: JourneyStep | null,
  rest: {
    readonly connections: ReadonlyArray<ConnectionSummary>;
    readonly placement: PlacementRead | null;
    readonly app?: AppRailFacts;
  } = { connections: [], placement: null },
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
    ...journeyRows4to8({ ...rest, labels: RAIL_LABELS }),
  ]);
}
