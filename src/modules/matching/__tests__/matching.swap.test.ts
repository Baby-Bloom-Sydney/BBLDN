// The `matching` swap test (03 §11's L3 law over the connector of 03 §7.4 / §10.1): keep `index.ts` +
// `types.ts`, swap the inside, and `public-site` / `onboarding-parent` / `admin-on-behalf` do not move.
//
// The direction the fix pass settled is what this pins: `matching` calls `scoring`, and `matching` calls
// `positions` — never the reverse (fix: A-1 / R2). So swapping `scoring` underneath `matching` changes what a
// caller sees without the caller knowing `scoring` exists.
import { beforeEach, describe, expect, it } from "vitest";
import { MATCHING } from "@/modules/config";
import { configureMatching, matching, stubMatching } from "@/modules/matching";
import { err } from "@/modules/platform";
import {
  configureScoring,
  stubDistanceProvider,
  stubScoring,
} from "@/modules/scoring";
import type { Candidate, PositionInput } from "@/modules/scoring";
import type { NannyId, PositionId } from "@/modules/shared-types";

const POSITION_ID = "position-1" as PositionId;
const ADMIN = Object.freeze({ kind: "admin" as const, id: "admin-1" as never });

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

const candidate = (id: string, patch: Partial<Candidate> = {}): Candidate =>
  Object.freeze({
    nannyId: id as NannyId,
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
    ...patch,
  });

beforeEach(() => {
  configureScoring(
    stubScoring({ distance: stubDistanceProvider(), config: MATCHING }),
  );
  configureMatching(
    stubMatching({
      pool: [candidate("nanny-a"), candidate("nanny-b")],
      positions: { [POSITION_ID]: POSITION },
    }),
  );
});

describe("matching through the connector binding", () => {
  it("fails closed before boot configures the inside", async () => {
    const notConfigured = err("INTERNAL", "Matching is not configured", {
      reason: "matching-not-configured" as const,
    });
    configureMatching({
      autofire: async () => notConfigured,
      quickMatch: async () => notConfigured,
      preAuthMatch: async () => notConfigured,
      resultsFor: async () => notConfigured,

      listPublicNannies: async () => notConfigured,
      getPublicNanny: async () => notConfigured,
      saveLead: async () => notConfigured,
      getLead: async () => notConfigured,
      connect: async () => notConfigured,
    });

    const result = await matching.quickMatch(null, {
      area: "Clapham",
      district: "SW4",
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "matching-not-configured",
    );
  });

  it("answers the public quick match without the caller touching scoring", async () => {
    const result = await matching.quickMatch(null, {
      area: "Clapham",
      district: "SW4",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.top.length).toBeLessThanOrEqual(
      MATCHING.quickMatch.topCount,
    );
  });

  it("runs the full engine for the pre-auth wizard", async () => {
    const result = await matching.preAuthMatch({
      area: { area: "Clapham", district: "SW4" },
      children: [{ ageLabel: "1–2 years" }],
      schedule: null,
      requirements: {},
    });

    expect(result.ok && result.value).toHaveLength(2);
  });

  it("reports an unknown position as NOT_FOUND rather than an empty result", async () => {
    const result = await matching.resultsFor(
      "position-missing" as PositionId,
      ADMIN,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });

  it("reports what autofire ranked, so precheck.fired has its props", async () => {
    const result = await matching.autofire(POSITION_ID, ADMIN);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.candidateCount).toBe(2);
    expect(result.ok && result.value.rankedCount).toBe(2);
    expect(result.ok && result.value.positionId).toBe(POSITION_ID);
  });

  it("counts the exclusions by reason instead of dropping them", async () => {
    configureMatching(
      stubMatching({
        pool: [candidate("nanny-a"), candidate("nanny-c", { isolated: true })],
        positions: { [POSITION_ID]: POSITION },
      }),
    );

    const result = await matching.autofire(POSITION_ID, ADMIN);

    expect(result.ok && result.value.excludedByReason).toEqual({ ISOLATED: 1 });
    expect(result.ok && result.value.rankedCount).toBe(1);
  });

  it("forwards a scoring failure unchanged rather than reporting an empty match", async () => {
    configureScoring({
      scorePosition: async () => distanceDown,
      quickMatch: async () => distanceDown,
      preAuthMatch: async () => distanceDown,
      topN: async () => distanceDown,
    });

    const result = await matching.autofire(POSITION_ID, ADMIN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("PROVIDER_ERROR");
  });
});

const distanceDown = err("PROVIDER_ERROR", "Distance provider failed", {
  reason: "distance-failed" as const,
});
