// 03 §7.2 `createScoring(deps)` — the three-layer engine (03 §7.1): exclusions first (returned, never dropped),
// then quality base × requirement penalties (floored) × over-qualified bonuses (capped), mapped to the display
// range; ordered score desc, distance asc, `nannyId` (03 §7.3). Pure: no stage move, no message, no row, no
// `Date.now()` — `at` comes from the caller. A failed distance fails the whole call, never a silent middle score.
import { err, ok } from "@/modules/platform";
import type {
  AreaRef,
  Candidate,
  Excluded,
  PositionInput,
  Ranked,
  ScoreResult,
  Scoring,
  ScoringDeps,
} from "../types";
import { compareRanked } from "./engine/compare-ranked";
import { exclusionOf } from "./engine/exclusion-of";
import { leadFormToPosition } from "./engine/lead-form-to-position";
import { overqualifiedBonus } from "./engine/overqualified-bonus";
import { qualityBase } from "./engine/quality-base";
import { requirementPenalties } from "./engine/requirement-penalties";
import { toDisplayScore } from "./engine/to-display-score";

type Scored = {
  readonly ranked: ReadonlyArray<Ranked>;
  readonly excluded: ReadonlyArray<Excluded>;
};

const RAW_MAX = 100;

export function createScoring(deps: ScoringDeps): Scoring {
  const { config, distance } = deps;

  const partition = (
    candidates: ReadonlyArray<Candidate>,
    withFamilyRule: boolean,
  ): { kept: ReadonlyArray<Candidate>; excluded: ReadonlyArray<Excluded> } => {
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
    return { kept, excluded };
  };

  const scoreOne = async (
    position: PositionInput,
    candidate: Candidate,
    area: AreaRef,
  ): Promise<ScoreResult<Ranked>> => {
    const km = await distance.distanceKm(area, candidate.area);
    if (!km.ok) return km;
    const quality = qualityBase(position, candidate, km.value, config);
    const penalty = requirementPenalties(position, candidate, config);
    const bonus = overqualifiedBonus(
      position,
      candidate,
      config,
      position.startDate,
    );
    const raw = Math.min(
      RAW_MAX,
      quality.base * penalty.multiplier * bonus.multiplier,
    );
    return ok({
      nannyId: candidate.nannyId,
      score: toDisplayScore(raw, config),
      layers: {
        base: quality.base,
        penalty: penalty.multiplier,
        bonus: bonus.multiplier,
      },
      distanceKm: km.value,
      scheduleOverlapPct: quality.scheduleOverlapPct,
      unmet: penalty.unmet,
      bonuses: bonus.bonuses,
    });
  };

  const rank = async (
    position: PositionInput,
    candidates: ReadonlyArray<Candidate>,
    withFamilyRule: boolean,
  ): Promise<ScoreResult<Scored>> => {
    const { kept, excluded } = partition(candidates, withFamilyRule);
    const scored: Ranked[] = [];
    for (const candidate of kept) {
      const one = await scoreOne(position, candidate, position.area);
      if (!one.ok) return one;
      scored.push(one.value);
    }
    return ok({
      ranked: Object.freeze([...scored].sort(compareRanked)),
      excluded: Object.freeze(excluded),
    });
  };

  return Object.freeze({
    scorePosition: (position, candidates) => rank(position, candidates, true),
    quickMatch: async (availability, district, candidates) => {
      const position = leadFormToPosition(
        {
          area: district,
          children: [],
          schedule: availability,
          requirements: {},
        },
        config,
      );
      if (!position.ok) return position;
      const result = await rank(position.value, candidates, false);
      if (!result.ok) return result;
      const above = result.value.ranked.filter(
        (entry) => entry.score >= config.quickMatch.minScore,
      );
      return ok({
        total: above.length,
        top: Object.freeze(above.slice(0, config.quickMatch.topCount)),
      });
    },
    preAuthMatch: async (leadForm, candidates) => {
      const position = leadFormToPosition(leadForm, config);
      if (!position.ok) return position;
      const result = await rank(position.value, candidates, true);
      return result.ok ? ok(result.value.ranked) : result;
    },
    topN: async (position, candidates, n) => {
      if (n <= 0)
        return err("VALIDATION", "n must be greater than zero", {
          reason: "invalid-input" as const,
        });
      const result = await rank(position, candidates, true);
      return result.ok ? ok(result.value.ranked.slice(0, n)) : result;
    },
  });
}
