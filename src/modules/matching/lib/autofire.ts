// 03 §7.4 — the pre-check, and the whole reason the call promise holds at level 2 (04 §3.1 step 12, T-1.4):
// before the matchmaker rings, the top nannies have been ranked and the lever recorded, so the call is about
// choosing who to meet rather than about whether anyone exists.
//
// The task lives **here**, not in `positions` (fix: A-1 / R2). It reads the position through
// `positions.getForMatching`, loads the candidate set itself (the loader pre-filters, `scoring` re-checks, so
// the rule lives in one place), runs `topN(position, pool, config.precheckN)` and writes the lever through
// `positions.recordPrecheck`.
//
// **Blast failure never fails the position write** (§7.4): the position is already committed when this runs, a
// provider error is logged by the caller and `precheck.failed` is emitted for the admin chase, and the
// waves sweep re-fires any `OPEN` position with no `precheck_fired_at`.
//
// **GAP, pinned (`matching.autofire.test.ts`, `it.fails`).** §7.4 also has autofire "notify each nanny
// (`precheck-nanny` batch via `comms.sendMany`)". A `comms` `Recipient` needs an `Email`, and the only nanny
// read this module has is `nanny_public` — marketplace-safe by design (07 §5.2): first name, no address. There
// is no ratified service-scope read of nanny contact details and inventing one would put a named use of
// personal data into the codebase that no document authorises. The blast is therefore **not built**; the lever,
// the ranking and `precheck.fired` are, so the parent-visible half of row 2 moves. Recorded in the `1e`
// PROGRESS entry with the shape it wants (a recipient port wired at boot, as the sinks are).
import { MATCHING } from "@/modules/config";
import { Events, nowInstant, ok } from "@/modules/platform";
import { positions } from "@/modules/positions";
import { scoring } from "@/modules/scoring";
import type { Candidate, DistanceProvider } from "@/modules/scoring";
import type {
  Actor,
  Instant,
  PositionId,
  Result,
} from "@/modules/shared-types";
import type { AutofireOutcome } from "../types";

export type AutofireDeps = {
  readonly pool: () => Promise<Result<ReadonlyArray<Candidate>>>;
  /**
   * Which distance provider the boot wired, for `precheck.fired.providerKind` (03 §7.5). `scoring`'s connector
   * does not publish it, so the composer that built the engine names it; day one it is haversine (§7.1).
   */
  readonly distanceKind?: DistanceProvider["kind"];
  readonly clock?: () => Instant;
};

/** The first wave; the waves sweep owns the later ones (03 §7.4 — waves / expiry / reminder are config). */
const FIRST_WAVE = 1;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

const tally = (
  reasons: ReadonlyArray<string>,
): Readonly<Record<string, number>> =>
  Object.freeze(
    reasons.reduce<Record<string, number>>(
      (acc, reason) => ({ ...acc, [reason]: (acc[reason] ?? 0) + 1 }),
      {},
    ),
  );

/** `config.matching.precheck.expiryDays` (03 §7.4 — expiry is config, never a literal here). */
const expiryOf = (firedAt: Instant): Instant =>
  new Date(
    Date.parse(firedAt) +
      MATCHING.precheck.expiryDays * HOURS_PER_DAY * MS_PER_HOUR,
  ).toISOString() as Instant;

export function autofire(deps: AutofireDeps) {
  const clock = deps.clock ?? nowInstant;
  return async (
    positionId: PositionId,
    actor: Actor,
  ): Promise<Result<AutofireOutcome>> => {
    const position = await positions.getForMatching(positionId);
    if (!position.ok) return position;
    const pool = await deps.pool();
    if (!pool.ok) return pool;

    const subject = { kind: "position" as const, id: positionId };
    const input = { id: positionId, ...position.value.detail };
    const ranked = await scoring.topN(input, pool.value, MATCHING.precheckN);
    if (!ranked.ok) {
      await Events.emit({
        name: "precheck.failed",
        actor,
        subject,
        positionId,
        props: { code: ranked.error.code, requestId: positionId },
      });
      return ranked;
    }
    const scored = await scoring.scorePosition(input, pool.value);

    const firedAt = clock();
    const lever = await positions.recordPrecheck(positionId, {
      firedAt,
      expiresAt: expiryOf(firedAt),
      wave: FIRST_WAVE,
    });
    if (!lever.ok) return lever;

    const outcome: AutofireOutcome = {
      positionId,
      candidateCount: pool.value.length,
      rankedCount: ranked.value.length,
      excludedByReason: scored.ok
        ? tally(scored.value.excluded.map((entry) => entry.reason))
        : {},
      providerKind: deps.distanceKind ?? "haversine",
      firedAt,
      wave: FIRST_WAVE,
    };
    const emitted = await Events.emit({
      name: "precheck.fired",
      actor,
      subject,
      positionId,
      props: {
        candidateCount: outcome.candidateCount,
        rankedCount: outcome.rankedCount,
        excludedByReason: outcome.excludedByReason,
        providerKind: outcome.providerKind,
      },
    });
    return emitted.ok ? ok(outcome) : emitted;
  };
}
