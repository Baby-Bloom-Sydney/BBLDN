// The "Preconditions" column of 03 §2.4's 25 K rows — the checks that are about something other than the
// connection's own stage, and so cannot live in the transition table.
//
// Three of them are the ones that matter on day one, and all three are about a nanny a family is being put in
// front of: **verification level** (`config.matching.minVerificationLevel`), **isolation** (I-5, ADR-017 /
// ADR-058 — an invited nanny belongs to the family that invited her and is out of every candidate set), and
// **no live duplicate** (one row per nanny per position, which `0007`'s partial unique index enforces
// underneath but which must refuse cleanly here rather than as a driver error the caller cannot read).
//
// `2d` gave the outcome a value: the creating rows already read the nanny's facts to check the floor, and the
// **silent hold** (ADR-158 (2); 02 §4.2 row 7) is decided from the same read. The facts are handed back rather
// than read a second time — one read, two decisions, and no way for the two to disagree.
import { CONNECTIONS, MATCHING } from "@/modules/config";
import { ok } from "@/modules/platform";
import { ENUMS } from "@/modules/shared-types";
import type { Result, TransitionId } from "@/modules/shared-types";
import type { ConnectionRecord, ConnectionsDeps, NannyFacts } from "../types";
import { CONNECTION_GUARDS } from "./connection-guards";
import { LIVE_STAGES } from "./live-stages";

/** The rows that put a nanny in front of a family for the first time (03 §2.4 K-1 / K-2 / K-3). */
const CREATES: ReadonlySet<string> = new Set(["K-1", "K-2", "K-3"]);

/** The rows that need availability before a meeting can be arranged (K-4 / K-5: "≥ config availability slots"). */
const NEEDS_SLOTS: ReadonlySet<string> = new Set(["K-4", "K-5"]);

/** What a creating row learned on the way through; empty for every other row. */
export type PreconditionOutcome = { readonly nanny?: NannyFacts };

const NOTHING_LEARNED: PreconditionOutcome = Object.freeze({});

/**
 * `MATCHING.minVerificationLevel` is the **ordinal** 3 ("visible in matching from L3_PROVISIONALLY_VERIFIED"),
 * and 02 §3's rule is that a verification enum's tuple index IS its ordinal (C-1). So the comparison is an index
 * comparison against the one tuple, never a string compare and never a second ladder.
 */
const levelRank = (level: string): number =>
  ENUMS.verification_level.indexOf(
    level as (typeof ENUMS.verification_level)[number],
  );

/**
 * I-5 and the verification floor, together, because they are asked at the same moment and refusing for the
 * wrong one would tell a caller the wrong thing. `ISOLATED_NANNY` is named in 03 §2.5's error list by that
 * exact word, so it is used by that exact word.
 */
function checkNanny(facts: NannyFacts): Result<void> {
  if (facts.isolated) return CONNECTION_GUARDS.precondition("ISOLATED_NANNY");
  if (levelRank(facts.verificationLevel) < MATCHING.minVerificationLevel)
    return CONNECTION_GUARDS.precondition("NANNY_NOT_VERIFIED");
  return ok(undefined);
}

/** "no live duplicate" — one live row per (position, nanny), matching `0007`'s partial unique index. */
function checkDuplicate(
  existing: ReadonlyArray<ConnectionRecord>,
  nannyId: string,
): Result<void> {
  const live = existing.some(
    (each) =>
      (each.nannyId as string) === nannyId && LIVE_STAGES.includes(each.stage),
  );
  return live
    ? CONNECTION_GUARDS.precondition("DUPLICATE_LIVE_CONNECTION")
    : ok(undefined);
}

/** "≤ config pending per parent" (K-1) — the cap S-P-07's "limit reached (5 pending)" state renders. */
function checkPendingCap(
  existing: ReadonlyArray<ConnectionRecord>,
): Result<void> {
  const pending = existing.filter(
    (each) => each.stage === "REQUEST_SENT",
  ).length;
  return pending >= CONNECTIONS.maxPendingRequestsPerParent
    ? CONNECTION_GUARDS.precondition("PENDING_CAP_REACHED")
    : ok(undefined);
}

type Input = {
  readonly deps: ConnectionsDeps;
  readonly id: TransitionId;
  readonly positionStage: string;
  readonly nannyId: string;
  readonly parentId: string;
  readonly positionId: string;
  readonly availabilitySlots?: number;
};

/** K-1 / K-2 / K-3 — the three checks about the nanny herself, plus K-1's cap. */
async function checkCreate(input: Input): Promise<Result<PreconditionOutcome>> {
  const { deps } = input;
  // "position live" — 03 §2.2's live set for a position is everything before `ENDED` / `CLOSED`
  if (input.positionStage === "ENDED" || input.positionStage === "CLOSED")
    return CONNECTION_GUARDS.precondition("POSITION_NOT_LIVE");

  const nanny = await deps.nannyFacts(
    input.nannyId as Parameters<ConnectionsDeps["nannyFacts"]>[0],
  );
  if (!nanny.ok) return nanny;
  if (nanny.value === null)
    return CONNECTION_GUARDS.precondition("NANNY_NOT_FOUND");
  const allowed = checkNanny(nanny.value);
  if (!allowed.ok) return allowed;

  const onPosition = await deps.store.forPosition(
    input.positionId as Parameters<ConnectionsDeps["positionFacts"]>[0],
  );
  if (!onPosition.ok) return onPosition;
  const duplicate = checkDuplicate(onPosition.value, input.nannyId);
  if (!duplicate.ok) return duplicate;

  if (input.id === "K-1") {
    const held = await deps.store.forParent(
      input.parentId as ConnectionRecord["parentId"],
    );
    if (!held.ok) return held;
    const cap = checkPendingCap(held.value);
    if (!cap.ok) return cap;
  }
  return ok(Object.freeze({ nanny: nanny.value }));
}

/**
 * K-17: "no other connection on this position at `OFFERED` / `CONFIRMED`" — the one-offer rule `0007`'s second
 * partial unique index enforces. Checked here so the refusal reads as a rule, not as a constraint.
 */
async function checkOneOffer(
  input: Input,
): Promise<Result<PreconditionOutcome>> {
  const onPosition = await input.deps.store.forPosition(
    input.positionId as Parameters<ConnectionsDeps["positionFacts"]>[0],
  );
  if (!onPosition.ok) return onPosition;
  const taken = onPosition.value.some(
    (each) =>
      (each.nannyId as string) !== input.nannyId &&
      (each.stage === "OFFERED" || each.stage === "CONFIRMED"),
  );
  return taken
    ? CONNECTION_GUARDS.precondition("ANOTHER_NANNY_OFFERED")
    : ok(NOTHING_LEARNED);
}

export async function checkPreconditions(
  input: Input,
): Promise<Result<PreconditionOutcome>> {
  if (CREATES.has(input.id)) return checkCreate(input);

  if (NEEDS_SLOTS.has(input.id)) {
    const given = input.availabilitySlots ?? 0;
    return given >= CONNECTIONS.minAvailabilitySlots
      ? ok(NOTHING_LEARNED)
      : CONNECTION_GUARDS.precondition("NOT_ENOUGH_AVAILABILITY");
  }

  if (input.id === "K-17") return checkOneOffer(input);

  return ok(NOTHING_LEARNED);
}
