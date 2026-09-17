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
// **The blast, built at last (ADR-136).** §7.4 also has autofire "notify each nanny (`precheck-nanny` batch via
// `comms.sendMany`)". `1e` pinned it `it.fails` because a `comms` `Recipient` needed an `Email` and the only
// nanny read this module has is `nanny_public` — marketplace-safe by design (07 §5.2): first name, no address.
// ADR-136 removed that requirement rather than the rule: a caller names a person and `comms` resolves the
// address inside its own send. So this module passes **nanny ids** and still cannot obtain an address.
//
// It goes through a port (`PrecheckBlast`), not an import, because 01 §2.3 gives `matching` no arrow to `comms`
// — the same inversion `connections` uses for its `AdvanceFn`. Boot supplies it; with no port wired the blast
// is simply `notified: 0`, which is what the module honestly did before.
import { MATCHING } from "@/modules/config";
import { Events, log, nowInstant, ok } from "@/modules/platform";
import { positions } from "@/modules/positions";
import { scoring } from "@/modules/scoring";
import type { Candidate, DistanceProvider } from "@/modules/scoring";
import type {
  Actor,
  Instant,
  PositionId,
  Result,
} from "@/modules/shared-types";
import type { AutofireOutcome, PrecheckBlast } from "../types";

export type AutofireDeps = {
  readonly pool: () => Promise<Result<ReadonlyArray<Candidate>>>;
  /**
   * 03 §7.4's `precheck-nanny` batch, handed in at boot (see `PrecheckBlast`). Optional: a failure here must
   * never fail the pre-check, because the lever is already written and the ranking already happened — §7.4's
   * own rule that "blast failure never fails the position write", read one step later.
   */
  readonly blast?: PrecheckBlast;
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

    // The blast runs after the lever, so a provider outage cannot cost the parent her pre-check: the ranking
    // and `precheck_fired_at` stand either way, and the waves sweep re-fires a position whose blast fell over.
    const blasted =
      deps.blast === undefined
        ? null
        : await deps.blast({
            positionId,
            nannyIds: ranked.value.map((entry) => entry.nannyId),
            wave: FIRST_WAVE,
          });
    if (blasted !== null && !blasted.ok)
      log.error("precheck blast failed; the lever stands", {
        module: "matching",
        action: "autofire.blast",
        alert: "ALERT_PROVIDER_DOWN",
        positionId,
        errorCode: blasted.error.code,
      });

    const outcome: AutofireOutcome = {
      positionId,
      notified: blasted?.ok === true ? blasted.value.notified : 0,
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
