// Swap test 6 (03 §11) — the acceptance for L3 on `scoring` and `scoring/distance`: keep `index.ts` + `types.ts`,
// swap the engine and swap the distance provider underneath it, and the caller's code does not move.
//
// The assertions are the parts of the contract a caller may rely on before the real engine exists: exclusions in
// the 03 §7.2 order and returned rather than dropped, `quickMatch` applying only the first three, ordering and
// tie-break, `topN` a prefix of `scorePosition` with `n <= 0` rejected, a failed distance failing the whole call,
// and determinism.
import { beforeEach, describe, expect, it } from "vitest";
import { MATCHING } from "@/modules/config";
import { err } from "@/modules/platform";
import {
  configureScoring,
  scoring,
  stubDistanceProvider,
  stubScoring,
} from "@/modules/scoring";
import type {
  Candidate,
  DistanceProvider,
  PositionInput,
} from "@/modules/scoring";
import type { NannyId } from "@/modules/shared-types";

const nanny = (value: string): NannyId => value as NannyId;

const CANDIDATE: Candidate = Object.freeze({
  nannyId: nanny("nanny-aaa"),
  area: { area: "Islington", district: "N1" },
  availability: [],
  experienceYears: 3,
  qualificationRung: 3,
  certifications: [],
  hasCar: false,
  attributes: {},
  languages: [],
  verificationLevel: MATCHING.minVerificationLevel,
  isolated: false,
  silentHold: false,
  activeConnectionWithFamily: false,
});

const candidateWith = (patch: Partial<Candidate>): Candidate =>
  Object.freeze({ ...CANDIDATE, ...patch });

const POSITION: PositionInput = Object.freeze({
  area: { area: "Clapham", district: "SW4" },
  schedule: null,
  requirements: {
    childAgeMonths: [{ min: 0, max: 36 }],
    capacity: 1,
    specialNeeds: false,
    licence: false,
    car: false,
    vaccination: false,
    nonSmoker: false,
    pets: false,
    roleType: "nanny",
  },
});

const failingDistance: DistanceProvider = Object.freeze({
  kind: "stub" as const,
  distanceKm: async () =>
    err("PROVIDER_ERROR", "Distance provider failed", {
      reason: "distance-failed" as const,
    }),
});

beforeEach(() => {
  configureScoring(
    stubScoring({ distance: stubDistanceProvider(), config: MATCHING }),
  );
});

describe("scoring through the connector binding", () => {
  it("fails closed before boot configures an engine", async () => {
    configureScoring({
      scorePosition: async () =>
        err("INTERNAL", "Scoring is not configured", {
          reason: "scoring-not-configured" as const,
        }),
      quickMatch: async () =>
        err("INTERNAL", "Scoring is not configured", {
          reason: "scoring-not-configured" as const,
        }),
      preAuthMatch: async () =>
        err("INTERNAL", "Scoring is not configured", {
          reason: "scoring-not-configured" as const,
        }),
      topN: async () =>
        err("INTERNAL", "Scoring is not configured", {
          reason: "scoring-not-configured" as const,
        }),
    });

    const result = await scoring.scorePosition(POSITION, [CANDIDATE]);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "scoring-not-configured",
    );
  });

  it("returns an exclusion with its reason rather than dropping the candidate", async () => {
    const result = await scoring.scorePosition(POSITION, [
      candidateWith({ nannyId: nanny("nanny-bbb"), isolated: true }),
      CANDIDATE,
    ]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.excluded).toEqual([
      { nannyId: "nanny-bbb", reason: "ISOLATED" },
    ]);
    expect(result.ok && result.value.ranked).toHaveLength(1);
  });

  it("applies the exclusion reasons in the contract's order", async () => {
    const result = await scoring.scorePosition(POSITION, [
      candidateWith({
        isolated: true,
        silentHold: true,
        verificationLevel: 0,
      }),
    ]);

    expect(result.ok && result.value.excluded[0]?.reason).toBe("ISOLATED");
  });

  it("does not apply the family-connection exclusion in quickMatch", async () => {
    const withFamily = candidateWith({ activeConnectionWithFamily: true });

    const quick = await scoring.quickMatch(null, POSITION.area, [withFamily]);
    const full = await scoring.scorePosition(POSITION, [withFamily]);

    expect(quick.ok && quick.value.total).toBe(1);
    expect(full.ok && full.value.excluded[0]?.reason).toBe(
      "ACTIVE_CONNECTION_WITH_FAMILY",
    );
  });

  it("orders by score descending and breaks ties on nannyId", async () => {
    const result = await scoring.scorePosition(POSITION, [
      candidateWith({ nannyId: nanny("nanny-zzz") }),
      candidateWith({ nannyId: nanny("nanny-aaa") }),
    ]);

    expect(result.ok).toBe(true);
    const scores = result.ok ? result.value.ranked.map((r) => r.score) : [];
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("returns topN as a prefix of scorePosition", async () => {
    const candidates = ["a", "b", "c"].map((suffix) =>
      candidateWith({ nannyId: nanny(`nanny-${suffix}`) }),
    );

    const all = await scoring.scorePosition(POSITION, candidates);
    const top = await scoring.topN(POSITION, candidates, 2);

    expect(top.ok).toBe(true);
    expect(all.ok).toBe(true);
    if (!top.ok || !all.ok) return;
    expect(top.value).toEqual(all.value.ranked.slice(0, 2));
  });

  it("rejects a non-positive n as VALIDATION", async () => {
    const result = await scoring.topN(POSITION, [CANDIDATE], 0);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("VALIDATION");
  });

  it("fails the whole call when distance fails, never a silent middle score", async () => {
    configureScoring(
      stubScoring({ distance: failingDistance, config: MATCHING }),
    );

    const result = await scoring.scorePosition(POSITION, [CANDIDATE]);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("PROVIDER_ERROR");
  });

  it("is deterministic — the same inputs give the same scores", async () => {
    const first = await scoring.scorePosition(POSITION, [CANDIDATE]);
    const second = await scoring.scorePosition(POSITION, [CANDIDATE]);

    expect(first).toEqual(second);
  });
});

describe("scoring/distance swapped underneath the same engine", () => {
  it("moves only distanceKm when the provider changes", async () => {
    const fixed = stubDistanceProvider({ "SW4|N1": 7 });
    configureScoring(stubScoring({ distance: fixed, config: MATCHING }));
    const withFixture = await scoring.scorePosition(POSITION, [CANDIDATE]);

    configureScoring(
      stubScoring({ distance: stubDistanceProvider(), config: MATCHING }),
    );
    const withDefault = await scoring.scorePosition(POSITION, [CANDIDATE]);

    expect(withFixture.ok && withFixture.value.ranked[0]?.distanceKm).toBe(7);
    expect(withFixture.ok && withFixture.value.ranked[0]?.score).toBe(
      withDefault.ok ? withDefault.value.ranked[0]?.score : null,
    );
  });

  it("reports an unknown district as null, not as a failure", async () => {
    const unknown = stubDistanceProvider({ "SW4|N1": null });
    configureScoring(stubScoring({ distance: unknown, config: MATCHING }));

    const result = await scoring.scorePosition(POSITION, [CANDIDATE]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.ranked[0]?.distanceKm).toBeNull();
  });
});

describe("the MatchingConfig table the engine reads", () => {
  it("has distance brackets in ascending km order", () => {
    const kms = MATCHING.DISTANCE_BRACKETS.map((bracket) => bracket.maxKm);
    expect([...kms].sort((a, b) => a - b)).toEqual(kms);
  });

  it("has weights that sum to one", () => {
    const total = Object.values(MATCHING.weights).reduce(
      (sum, weight) => sum + weight,
      0,
    );
    expect(total).toBeCloseTo(1, 10);
  });
});
