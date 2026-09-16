// `stubScoring` (03 §7.5) — the engine's stub: every consumer's tests run against it, and swap test 6 compares it
// against the real engine once that exists. Deliberately not an engine: the score is
// `displayRange.min + hash % 51`, so it is deterministic, inside the display range and carries no opinion about
// location, schedule or qualifications. What it **does** honour exactly is the part callers depend on:
//
//   · exclusions applied before any layer, in the 03 §7.2 order, with the reason returned and never dropped;
//   · `quickMatch` applies the first three reasons only;
//   · ordering score desc, then distance asc, then `nannyId` (03 §7.3);
//   · `topN` is a prefix of `scorePosition`; `n <= 0` is `VALIDATION`;
//   · a failed distance fails the whole call — never a silent middle score (03 §7.3).
import { err, ok } from "@/modules/platform";
import type {
  Candidate,
  DistanceProvider,
  Excluded,
  ExclusionReason,
  MatchingConfig,
  Ranked,
  ScoreResult,
  Scoring,
} from "./types";

const SCORE_SPREAD = 51;

const hashOf = (value: string): number => {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) % 1_000_003;
  }
  return hash;
};

/** 03 §7.2 order; `quickMatch` stops after the first three. */
function exclusionOf(
  candidate: Candidate,
  minVerificationLevel: number,
  withFamilyRule: boolean,
): ExclusionReason | null {
  if (candidate.isolated) return "ISOLATED";
  if (candidate.verificationLevel < minVerificationLevel)
    return "VERIFICATION_LEVEL";
  if (candidate.silentHold) return "SILENT_HOLD";
  if (withFamilyRule && candidate.activeConnectionWithFamily)
    return "ACTIVE_CONNECTION_WITH_FAMILY";
  return null;
}

export function stubScoring(deps: {
  readonly distance: DistanceProvider;
  readonly config: MatchingConfig;
}): Scoring {
  const { config, distance } = deps;

  const rank = async (
    candidates: ReadonlyArray<Candidate>,
    area: { readonly area: string; readonly district: string },
    withFamilyRule: boolean,
  ): ScoreResultOf => {
    const kept: Candidate[] = [];
    const excluded: Excluded[] = [];
    for (const candidate of candidates) {
      const reason = exclusionOf(
        candidate,
        config.minVerificationLevel,
        withFamilyRule,
      );
      if (reason === null) kept.push(candidate);
      else excluded.push({ nannyId: candidate.nannyId, reason });
    }

    const scored: Ranked[] = [];
    for (const candidate of kept) {
      const km = await distance.distanceKm(area, candidate.area);
      if (!km.ok) return km;
      scored.push({
        nannyId: candidate.nannyId,
        score:
          config.displayRange.min + (hashOf(candidate.nannyId) % SCORE_SPREAD),
        layers: { base: 1, penalty: 1, bonus: 1 },
        distanceKm: km.value,
        scheduleOverlapPct: null,
        unmet: [],
        bonuses: [],
      });
    }

    const ranked = Object.freeze(
      [...scored].sort(
        (left, right) =>
          right.score - left.score ||
          (left.distanceKm ?? Number.POSITIVE_INFINITY) -
            (right.distanceKm ?? Number.POSITIVE_INFINITY) ||
          left.nannyId.localeCompare(right.nannyId),
      ),
    );
    return ok({ ranked, excluded: Object.freeze(excluded) });
  };

  return Object.freeze({
    scorePosition: (position, candidates) =>
      rank(candidates, position.area, true),
    preAuthMatch: async (leadForm, candidates) => {
      const result = await rank(candidates, leadForm.area, true);
      return result.ok ? ok(result.value.ranked) : result;
    },
    quickMatch: async (_availability, district, candidates) => {
      const result = await rank(candidates, district, false);
      if (!result.ok) return result;
      const above = result.value.ranked.filter(
        (entry) => entry.score >= config.quickMatch.minScore,
      );
      return ok({
        total: above.length,
        top: Object.freeze(above.slice(0, config.quickMatch.topCount)),
      });
    },
    topN: async (position, candidates, n) => {
      if (n <= 0) {
        return err("VALIDATION", "n must be greater than zero", {
          reason: "invalid-input" as const,
        });
      }
      const result = await rank(candidates, position.area, true);
      return result.ok ? ok(result.value.ranked.slice(0, n)) : result;
    },
  });
}

type ScoreResultOf = Promise<
  ScoreResult<{
    readonly ranked: ReadonlyArray<Ranked>;
    readonly excluded: ReadonlyArray<Excluded>;
  }>
>;
