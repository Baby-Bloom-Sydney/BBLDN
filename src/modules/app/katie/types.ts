// app/katie — the assistant inside the paid product (ADR-019; `FLAGS.KATIE`, 01 §3.4). Its tools re-check access
// per call and its context builder is scoped to the bot (07 §10.1 row `app/katie`).
//
// GAP — recorded in the L-005 F-c PROGRESS entry: no foundation section states Katie's connector signature. The
// tool surface, the cost cap (`chat_cost_daily`, 07 §8 row 8) and the proactive / compaction jobs are Phase 4.
// Only the vocabulary the foundations do name is declared here; nothing is invented.
import type {
  ChildId,
  FamilyId,
  Instant,
  UserId,
} from "@/modules/shared-types";

/** Who Katie is answering for — every tool call re-checks this against the gate (07 §10.1). */
export type KatieScope = {
  readonly userId: UserId;
  readonly familyId: FamilyId;
  readonly childId?: ChildId;
};

/** The two proactive jobs 01 §4f names (`proactive`, `compact-daily`); neither moves a stage. */
export type KatieJobName = "proactive" | "compact-daily";

export type KatieTurn = {
  readonly scope: KatieScope;
  readonly at: Instant;
};
