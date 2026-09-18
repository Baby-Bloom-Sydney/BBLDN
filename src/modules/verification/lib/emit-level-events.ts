// The level moved (ADR-157 / ADR-158): one `verification.level-changed` per change (02 §4.3), `verification.held`
// when she enters the pool with the hold armed (L3), `verification.released` when the hold lifts (L4). The actor
// is the system: the level is derived, not decided, whoever moved the facts beneath it.
import { ENUMS } from "@/modules/shared-types";
import type { UserId } from "@/modules/shared-types";
import type { LevelSync } from "../types";
import { emitVerificationEvent } from "./emit-verification-event";

const rank = (level: string): number =>
  ENUMS.verification_level.indexOf(level as never);
const POOL = rank("L3_PROVISIONALLY_VERIFIED");
const FULL = rank("L4_FULLY_VERIFIED");

export async function emitLevelEvents(
  nannyId: UserId,
  sync: LevelSync,
): Promise<void> {
  if (sync.fromLevel === sync.toLevel) return;
  await emitVerificationEvent({
    name: "verification.level-changed",
    actor: { kind: "system", id: "cascade" },
    props: {
      nannyId,
      check: "dbs",
      fromLevel: sync.fromLevel,
      toLevel: sync.toLevel,
    },
  });
  if (rank(sync.toLevel) === POOL && rank(sync.fromLevel) < POOL)
    await emitVerificationEvent({
      name: "verification.held",
      actor: { kind: "system", id: "cascade" },
      props: { nannyId, check: "dbs", holdReason: "below-l4" },
    });
  if (rank(sync.toLevel) === FULL && rank(sync.fromLevel) < FULL)
    await emitVerificationEvent({
      name: "verification.released",
      actor: { kind: "system", id: "cascade" },
      props: { nannyId, check: "dbs" },
    });
}
