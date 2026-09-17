// S-P-05 `/parent/position` (04 §6.2) — the page's shape, composed from the position row alone. Pure: the route
// renders what this returns and asks nothing else.
//
// **What is here and what is not.** 04 §6.2 gives S-P-05 four parts: the summary, the confirmed connections,
// the upcoming meetings and the placement card. The last three read the K and L stages, which `1f` / `1g` own —
// this unit ships the summary, the stage line (`04.09` status codes v2) and the one lever a parent holds on her
// own position (P-7). The missing parts are recorded, not faked: an empty "no meetings" panel would tell a
// parent something the system does not know.
import type { TransitionId } from "@/modules/shared-types";
import type { PositionSummary } from "../types";

export type PositionPageView = {
  readonly area: string;
  readonly district: string;
  readonly childCount: number;
  readonly days: number;
  readonly stageLine: string;
  readonly canClose: boolean;
};

/** `04.09` — one line per stage, in a parent's words, never the enum. */
const STAGE_LINES: Readonly<Record<string, string>> = Object.freeze({
  DRAFT: "Not sent yet — finish your answers when you're ready.",
  OPEN: "Live — we're lining up your top nannies.",
  CONNECTING: "Your matchmaker is arranging your meetings.",
  ACTIVE: "Your nanny is in place.",
  ENDED: "This one has ended.",
  CLOSED: "You closed this one.",
});

export function positionPageView(
  record: PositionSummary,
  allowed: ReadonlyArray<TransitionId>,
): PositionPageView {
  return Object.freeze({
    area: record.detail.area.area,
    district: record.detail.area.district,
    childCount: record.detail.requirements.childAgeMonths.length,
    days: new Set(
      (record.detail.schedule?.blocks ?? []).map((block) => block.day),
    ).size,
    stageLine: STAGE_LINES[record.stage] ?? "",
    canClose: allowed.includes("P-7"),
  });
}
