// 01 §3.1 / 03 §7.2 `MatchingConfig` — weights, penalties, bonuses and curves carried verbatim from Sydney
// (03 §7.5 "config defaults"; legacy src/lib/matching/constants.ts), London distance brackets from the B-10 default,
// the quick-match display floor (ADR-080), pre-check inputs for dfy-waves (Sydney standard tier as seed; 01 §10 O-8),
// the age-range → months map 03 §7.3 reads. Tags mark what BAI still rules.
export const MATCHING = Object.freeze({
  weights: Object.freeze({
    location: 0.25,
    schedule: 0.3,
    experience: 0.2,
    roleFit: 0.1,
    qualifications: 0.1,
    supportFit: 0.05,
  }),
  DISTANCE_BRACKETS: Object.freeze([
    Object.freeze({ maxKm: 1.5, points: 100 }),
    Object.freeze({ maxKm: 3, points: 85 }),
    Object.freeze({ maxKm: 6, points: 65 }),
    Object.freeze({ maxKm: 10, points: 45 }),
    Object.freeze({ maxKm: 15, points: 25 }),
    Object.freeze({ maxKm: 20, points: 10 }),
  ]), // > 20 km → 0 — @pending:B-10 (default running now)
  unknownDistancePoints: 25, // [unverified]
  carDistanceMultiplier: 1, // [unverified] — no car uplift on distance day one
  scheduleCurve: Object.freeze([
    Object.freeze({ minCoveragePct: 100, points: 100 }),
    Object.freeze({ minCoveragePct: 90, points: 92 }),
    Object.freeze({ minCoveragePct: 80, points: 75 }),
    Object.freeze({ minCoveragePct: 70, points: 55 }),
    Object.freeze({ minCoveragePct: 50, points: 25 }),
    Object.freeze({ minCoveragePct: 0, points: 5 }),
  ]),
  flexibleBoost: 1, // [unverified] — Flexible schedule scores full marks (03 §7.2 `null = full marks`)
  penalties: Object.freeze({
    childAgeMonths: 0.5,
    capacity: 0.6,
    specialNeeds: 0.6,
    licence: 0.7,
    car: 0.7,
    vaccination: 0.8,
    nonSmoker: 0.8,
    pets: 0.85,
    nannyAge: 0.85,
    nannyAgeSevere: 0.7,
    languages: 1,
    roleType: 1,
    supportNeeds: 1,
  }),
  penaltyFloor: 0.3,
  bonuses: Object.freeze({
    extraExperiencePerYear: 1.03,
    extraExperienceCap: 1.15,
    certificationPer: 1.04,
    certificationCap: 1.12,
    higherQualification: 1.05,
    carUnrequired: 1.03,
    immediateStart: 1.05,
    languageMatch: 1.04,
    ageOverMinPerTwo: 1.02,
    ageOverMinCap: 1.06,
  }),
  bonusCap: 1.25,
  displayRange: Object.freeze({ min: 50, max: 100 }),
  qualificationLadder: Object.freeze([
    Object.freeze({ key: "none", label: "No qualifications", rung: 0 }),
    Object.freeze({ key: "other", label: "Other", rung: 1 }),
    Object.freeze({ key: "level-2", label: "Level 2 childcare", rung: 2 }),
    Object.freeze({ key: "level-3", label: "Level 3 childcare", rung: 3 }),
    Object.freeze({
      key: "level-5",
      label: "Level 5 / foundation degree",
      rung: 4,
    }),
    Object.freeze({
      key: "degree",
      label: "Degree in early years (or equivalent)",
      rung: 5,
    }),
  ]), // [unverified] UK vocabulary @pending: 03 §12 item 26 (Sydney's AU names are not carried)
  minVerificationLevel: 3, // visible in matching from L3_PROVISIONALLY_VERIFIED (03 §4.3)
  precheckN: 20, // Sydney standard tier totalNannies; tiers collapse into one pre-check (03 §7.4)
  precheck: Object.freeze({ waves: 1, maxRespondents: 5, expiryDays: 3 }), // Sydney standard tier — @pending: 01 §10 O-8 (08.25)
  quickMatch: Object.freeze({ minScore: 50, topCount: 3, floorDisplay: null }), // topCount = Sydney's top3; floor ADR-080 [unverified]
  ageRangeToMonths: Object.freeze({
    "0–3 months": 1,
    "3–6 months": 4,
    "6–12 months": 9,
    "1–2 years": 18,
    "2–3 years": 30,
    "3–4 years": 42,
    "4–5 years": 54,
    "5–10 years": 90,
    "10–13 years": 138,
    "13–16 years": 174,
    "16+": 192,
  }),
});
