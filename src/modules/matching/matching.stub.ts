// The `matching` stub — the connector answered from a seeded candidate list and whatever `scoring` is configured
// with, so `public-site`, `onboarding-parent` and the admin levers can be built before the nanny tables exist.
//
// It is not the loader: the real `matching` reads verified, non-isolated, non-held nannies from the database and
// `scoring` re-checks them (03 §7.4). Here the caller supplies the list, so the **filtering rule is not
// duplicated** — the stub delegates every exclusion to `scoring`, exactly as the real loader must.
//
// `autofire` here reports what it ranked and writes nothing — the real one (`1e`) writes the lever through
// `positions.recordPrecheck` and emits `precheck.fired`; a stub that wrote would hide which of the two a
// consumer's test actually exercised.
import { MATCHING as MATCHING_CONFIG } from "@/modules/config";
import { err, nowInstant, ok } from "@/modules/platform";
import { scoring } from "@/modules/scoring";
import type { Candidate, PositionInput } from "@/modules/scoring";
import type { LeadId } from "@/modules/shared-types";
import type { Matching, ParentLead, PublicNanny } from "./types";
import { connectDecision } from "./lib/connect-decision";
import { toCandidate } from "./lib/to-candidate";

export type StubMatchingSeed = {
  readonly pool?: ReadonlyArray<Candidate>;
  readonly positions?: Readonly<Record<string, PositionInput>>;
  /** `1b`: the marketplace-safe nannies a screen shows; each also becomes a candidate unless `pool` is given. */
  readonly nannies?: ReadonlyArray<PublicNanny>;
  readonly leadRows?: ReadonlyArray<ParentLead>;
};

export function stubMatching(seed: StubMatchingSeed = {}): Matching {
  const nannies = seed.nannies ?? Object.freeze([]);
  const pool = seed.pool ?? Object.freeze(nannies.map(toCandidate));
  const leadStore = new Map<LeadId, ParentLead>(
    (seed.leadRows ?? []).map((lead) => [lead.id, lead]),
  );

  const positionOr = (positionId: string) => seed.positions?.[positionId];

  return Object.freeze({
    quickMatch: async (availability, district) => {
      const result = await scoring.quickMatch(availability, district, pool);
      return result.ok ? ok(result.value) : result;
    },
    preAuthMatch: async (leadForm) => {
      const result = await scoring.preAuthMatch(leadForm, pool);
      return result.ok ? ok(result.value) : result;
    },
    resultsFor: async (positionId) => {
      const position = positionOr(positionId);
      if (position === undefined) return notFound(positionId);
      const result = await scoring.scorePosition(position, pool);
      return result.ok ? ok(result.value.ranked) : result;
    },
    listPublicNannies: async () => ok(nannies),
    getPublicNanny: async (nannyId) =>
      ok(nannies.find((nanny) => nanny.nannyId === nannyId) ?? null),
    saveLead: async (input) => {
      leadStore.set(input.id, {
        id: input.id,
        answers: input.answers,
        area: input.answers.area ?? null,
        source: input.source,
        completed: input.completed,
      });
      return ok(undefined);
    },
    getLead: async (leadId) => ok(leadStore.get(leadId) ?? null),
    connect: async (input) => ok(connectDecision(input)),
    autofire: async (positionId) => {
      const position = positionOr(positionId);
      if (position === undefined) return notFound(positionId);
      const ranked = await scoring.topN(
        position,
        pool,
        MATCHING_CONFIG.precheckN,
      );
      if (!ranked.ok) return ranked;
      const scored = await scoring.scorePosition(position, pool);
      const excludedByReason = scored.ok
        ? tally(scored.value.excluded.map((entry) => entry.reason))
        : {};
      return ok({
        positionId,
        candidateCount: pool.length,
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
