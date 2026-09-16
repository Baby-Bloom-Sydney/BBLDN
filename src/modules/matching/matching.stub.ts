// The `matching` stub — the connector answered from a seeded candidate list and whatever `scoring` is configured
// with, so `public-site`, `onboarding-parent` and the admin levers can be built before the nanny tables exist.
//
// It is not the loader: the real `matching` reads verified, non-isolated, non-held nannies from the database and
// `scoring` re-checks them (03 §7.4). Here the caller supplies the list, so the **filtering rule is not
// duplicated** — the stub delegates every exclusion to `scoring`, exactly as the real loader must.
//
// `autofire` reports what it ranked and writes nothing: the lever (`positions.recordPrecheck`) and the
// `precheck-nanny` blast are Phase 1e.
import { MATCHING as MATCHING_CONFIG } from "@/modules/config";
import { err, nowInstant, ok } from "@/modules/platform";
import { scoring } from "@/modules/scoring";
import type { Candidate, PositionInput } from "@/modules/scoring";
import type { Matching } from "./types";

export type StubMatchingSeed = {
  readonly candidates?: ReadonlyArray<Candidate>;
  readonly positions?: Readonly<Record<string, PositionInput>>;
};

export function stubMatching(seed: StubMatchingSeed = {}): Matching {
  const candidates = seed.candidates ?? Object.freeze([]);

  const positionOr = (positionId: string) => seed.positions?.[positionId];

  return Object.freeze({
    quickMatch: async (availability, district) => {
      const result = await scoring.quickMatch(
        availability,
        district,
        candidates,
      );
      return result.ok ? ok(result.value) : result;
    },
    preAuthMatch: async (leadForm) => {
      const result = await scoring.preAuthMatch(leadForm, candidates);
      return result.ok ? ok(result.value) : result;
    },
    resultsFor: async (positionId) => {
      const position = positionOr(positionId);
      if (position === undefined) return notFound(positionId);
      const result = await scoring.scorePosition(position, candidates);
      return result.ok ? ok(result.value.ranked) : result;
    },
    autofire: async (positionId) => {
      const position = positionOr(positionId);
      if (position === undefined) return notFound(positionId);
      const ranked = await scoring.topN(
        position,
        candidates,
        MATCHING_CONFIG.precheckN,
      );
      if (!ranked.ok) return ranked;
      const scored = await scoring.scorePosition(position, candidates);
      const excludedByReason = scored.ok
        ? tally(scored.value.excluded.map((entry) => entry.reason))
        : {};
      return ok({
        positionId,
        candidateCount: candidates.length,
        rankedCount: ranked.value.length,
        excludedByReason,
        providerKind: "stub",
        firedAt: nowInstant(),
        wave: 1,
      });
    },
  });
}

const notFound = (which: string) =>
  err("NOT_FOUND", "Position not found", {
    reason: "E_ENTITY_NOT_FOUND" as const,
    which,
  });

const tally = (
  reasons: ReadonlyArray<string>,
): Readonly<Record<string, number>> =>
  Object.freeze(
    reasons.reduce<Record<string, number>>(
      (counts, reason) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }),
      {},
    ),
  );
