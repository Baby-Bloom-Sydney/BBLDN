// The real engine (03 §7.1–§7.3; row `04.01`) as executable claims: location × schedule drive the quick match;
// every stated requirement a candidate misses is a floored penalty **and** is reported; bonuses compound to a
// cap; the display range holds; ordering and determinism; exclusions before any layer; a failed distance fails
// the whole call; `preAuthMatch` rejects an age label the config does not know; `topN` is a prefix.
import { describe, expect, it } from "vitest";
import { MATCHING } from "@/modules/config";
import { err } from "@/modules/platform";
import { createScoring, stubDistanceProvider } from "@/modules/scoring";
import type {
  Candidate,
  DistanceProvider,
  PositionInput,
  Requirements,
  Schedule,
  ScheduleBlock,
} from "@/modules/scoring";
import type { NannyId } from "@/modules/shared-types";

const nanny = (value: string): NannyId => value as NannyId;

const AVAILABILITY: ReadonlyArray<ScheduleBlock> = Object.freeze([
  { day: 0, part: "morning" },
  { day: 0, part: "midday" },
  { day: 1, part: "morning" },
]);

const CANDIDATE: Candidate = Object.freeze({
  nannyId: nanny("nanny-aaa"),
  area: { area: "Clapham", district: "SW4" },
  availability: AVAILABILITY,
  experienceYears: 3,
  qualificationRung: 3,
  certifications: [],
  hasCar: false,
  attributes: {},
  languages: ["English"],
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
    childAgeMonths: [{ min: 12, max: 24 }],
    capacity: 1,
    specialNeeds: false,
    licence: false,
    car: false,
    vaccination: false,
    nonSmoker: false,
    pets: false,
    roleType: "",
  },
});

type PositionPatch = Omit<Partial<PositionInput>, "requirements"> & {
  readonly requirements?: Partial<Requirements>;
};

const positionWith = (patch: PositionPatch): PositionInput =>
  Object.freeze({
    ...POSITION,
    ...patch,
    requirements: { ...POSITION.requirements, ...patch.requirements },
  });

/** Same district → 0 km; otherwise a fixed 5 km — deterministic and independent of `areas`. */
const fiveKm: DistanceProvider = Object.freeze({
  kind: "stub" as const,
  distanceKm: async (a, b) => ({
    ok: true as const,
    value: a.district === b.district ? 0 : 5,
  }),
});

const engine = createScoring({ distance: fiveKm, config: MATCHING });

describe("scoring engine — quick match is location × schedule (03 §7.2)", () => {
  const monMorning: Schedule = {
    type: "Fixed",
    blocks: [{ day: 0, part: "morning" }],
  };

  it("ranks the nanny who covers the requested block and lives nearest first", async () => {
    const near = candidateWith({ nannyId: nanny("near") });
    const far = candidateWith({
      nannyId: nanny("far"),
      area: { area: "Ealing", district: "W5" },
    });
    const noCover = candidateWith({
      nannyId: nanny("no-cover"),
      availability: [],
    });
    const result = await engine.quickMatch(monMorning, POSITION.area, [
      noCover,
      far,
      near,
    ]);
    expect(result.ok && result.value.top.map((r) => r.nannyId)).toEqual([
      "near",
      "far",
      "no-cover",
    ]);
    expect(result.ok && result.value.top[0]?.scheduleOverlapPct).toBe(100);
    expect(result.ok && result.value.top[2]?.scheduleOverlapPct).toBe(0);
  });

  it("counts only nannies at or above `quickMatch.minScore` and returns `topCount`", async () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      candidateWith({ nannyId: nanny(`n-${index}`) }),
    );
    const result = await engine.quickMatch(null, POSITION.area, many);
    expect(result.ok && result.value.total).toBe(6);
    expect(result.ok && result.value.top).toHaveLength(
      MATCHING.quickMatch.topCount,
    );
    for (const entry of result.ok ? result.value.top : [])
      expect(entry.score).toBeGreaterThanOrEqual(MATCHING.quickMatch.minScore);
  });

  it("applies only the first three exclusions on the quick match, all four on a position", async () => {
    const withFamily = candidateWith({
      nannyId: nanny("with-family"),
      activeConnectionWithFamily: true,
    });
    const held = candidateWith({ nannyId: nanny("held"), silentHold: true });
    const quick = await engine.quickMatch(null, POSITION.area, [
      withFamily,
      held,
    ]);
    expect(quick.ok && quick.value.top.map((r) => r.nannyId)).toEqual([
      "with-family",
    ]);
    const full = await engine.scorePosition(POSITION, [withFamily, held]);
    expect(full.ok && full.value.excluded).toEqual([
      { nannyId: "with-family", reason: "ACTIVE_CONNECTION_WITH_FAMILY" },
      { nannyId: "held", reason: "SILENT_HOLD" },
    ]);
  });
});

describe("scoring engine — the three layers (03 §7.1)", () => {
  it("penalises every stated requirement the candidate misses, reports it, and never drops below the floor", async () => {
    const demanding = positionWith({
      requirements: {
        licence: true,
        car: true,
        vaccination: true,
        pets: true,
        specialNeeds: true,
        nonSmoker: true,
        languages: ["Spanish"],
      },
    });
    const result = await engine.scorePosition(demanding, [CANDIDATE]);
    const ranked = result.ok ? result.value.ranked[0] : undefined;
    expect(ranked?.layers.penalty).toBe(MATCHING.penaltyFloor);
    expect(ranked?.unmet).toEqual([
      "specialNeeds",
      "licence",
      "car",
      "vaccination",
      "pets",
      "languages",
    ]);
    expect(ranked?.unmet).not.toContain("nonSmoker");
  });

  it("compounds over-qualified bonuses and caps the product at `bonusCap`", async () => {
    const overqualified = candidateWith({
      experienceYears: 20,
      certifications: ["a", "b", "c", "d", "e"],
      qualificationRung: 5,
      hasCar: true,
      languages: ["English", "French"],
      age: 45,
    });
    const wanting = positionWith({
      minExperienceYears: 1,
      minQualificationRung: 2,
      requirements: { languages: ["French"], nannyAge: { min: 26 } },
    });
    const result = await engine.scorePosition(wanting, [overqualified]);
    const ranked = result.ok ? result.value.ranked[0] : undefined;
    expect(ranked?.layers.bonus).toBe(MATCHING.bonusCap);
    expect(ranked?.bonuses).toEqual([
      "extra-experience",
      "certifications",
      "higher-qualification",
      "car",
      "language-match",
      "age-over-minimum",
    ]);
  });

  it("keeps every score inside the display range", async () => {
    const worst = candidateWith({
      experienceYears: 0,
      qualificationRung: 0,
      availability: [],
      area: { area: "Ealing", district: "W5" },
    });
    const best = candidateWith({ experienceYears: 20, qualificationRung: 5 });
    const result = await engine.scorePosition(POSITION, [worst, best]);
    for (const entry of result.ok ? result.value.ranked : []) {
      expect(entry.score).toBeGreaterThanOrEqual(MATCHING.displayRange.min);
      expect(entry.score).toBeLessThanOrEqual(MATCHING.displayRange.max);
    }
  });

  it("orders score desc, distance asc, then nannyId, and is deterministic", async () => {
    const list = [
      candidateWith({ nannyId: nanny("b") }),
      candidateWith({ nannyId: nanny("a") }),
      candidateWith({
        nannyId: nanny("far"),
        area: { area: "Ealing", district: "W5" },
      }),
    ];
    const first = await engine.scorePosition(POSITION, list);
    const second = await engine.scorePosition(POSITION, [...list].reverse());
    expect(first.ok && first.value.ranked.map((r) => r.nannyId)).toEqual([
      "a",
      "b",
      "far",
    ]);
    expect(first).toEqual(second);
  });

  it("fails the whole call when the distance provider fails — never a silent middle score", async () => {
    const broken: DistanceProvider = {
      kind: "stub",
      distanceKm: async () =>
        err("PROVIDER_ERROR", "down", { reason: "distance-failed" as const }),
    };
    const result = await createScoring({
      distance: broken,
      config: MATCHING,
    }).scorePosition(POSITION, [CANDIDATE]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("PROVIDER_ERROR");
  });

  it("scores an unknown distance at `unknownDistancePoints` rather than failing", async () => {
    const unknown: DistanceProvider = {
      kind: "stub",
      distanceKm: async () => ({ ok: true as const, value: null }),
    };
    const result = await createScoring({
      distance: unknown,
      config: MATCHING,
    }).scorePosition(POSITION, [CANDIDATE]);
    expect(result.ok && result.value.ranked[0]?.distanceKm).toBeNull();
  });
});

describe("scoring engine — preAuthMatch + topN (03 §7.3)", () => {
  it("maps the lead form through `ageRangeToMonths` and rejects an unknown label", async () => {
    const good = await engine.preAuthMatch(
      {
        area: POSITION.area,
        children: [{ ageLabel: "1–2 years" }],
        schedule: null,
        requirements: {},
      },
      [CANDIDATE],
    );
    expect(good.ok && good.value).toHaveLength(1);
    const bad = await engine.preAuthMatch(
      {
        area: POSITION.area,
        children: [{ ageLabel: "ninety" as never }],
        schedule: null,
        requirements: {},
      },
      [CANDIDATE],
    );
    expect(!bad.ok && bad.error.code).toBe("VALIDATION");
  });

  it("`topN` is a prefix of `scorePosition` and refuses n ≤ 0", async () => {
    const list = ["c", "a", "b"].map((id) =>
      candidateWith({ nannyId: nanny(id) }),
    );
    const all = await engine.scorePosition(POSITION, list);
    const top = await engine.topN(POSITION, list, 2);
    expect(top.ok && top.value).toEqual(
      all.ok ? all.value.ranked.slice(0, 2) : [],
    );
    const zero = await engine.topN(POSITION, list, 0);
    expect(!zero.ok && zero.error.code).toBe("VALIDATION");
  });
});

describe("scoring engine — the same contract shape as the stub (swap test 6)", () => {
  it("answers through the connector binding after `configureScoring(createScoring(...))`", async () => {
    const { configureScoring, scoring } = await import("@/modules/scoring");
    configureScoring(
      createScoring({ distance: stubDistanceProvider(), config: MATCHING }),
    );
    const result = await scoring.quickMatch(null, POSITION.area, [CANDIDATE]);
    expect(result.ok && result.value.total).toBe(1);
  });
});
