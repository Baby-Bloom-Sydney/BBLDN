// The `matching` inside (1b) as executable claims: candidates come from `nanny_public` through `auth`'s port
// (ADR-129; 07 §5.2), never from `nannies`; the view's rows become the display shape and the `scoring` snapshot;
// the quick match and the pre-auth match go through `scoring`; the lead saves progressively at service scope and
// reads back; the Connect entry point decides by session (ADR-126 / 04 §3.3 (d)); the two `1e` methods answer
// `not-built`, never a fabricated result.
import { beforeEach, describe, expect, it } from "vitest";
import { stubAuth } from "@/modules/auth";
import type { Session } from "@/modules/auth";
import { MATCHING } from "@/modules/config";
import { createMatching } from "@/modules/matching";
import type { PublicNanny } from "@/modules/matching";
import {
  configureScoring,
  createScoring,
  stubDistanceProvider,
} from "@/modules/scoring";
import type { LeadId, NannyId, UserId } from "@/modules/shared-types";
import { toCandidate } from "../lib/to-candidate";
import { connectDecision } from "../lib/connect-decision";
import { quickMatchSchedule } from "../lib/quick-match-schedule";

const NANNY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NANNY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as LeadId;

const publicRow = (id: string, over: Record<string, unknown> = {}) => ({
  nanny_id: id,
  first_name: "Amara",
  area: "Clapham",
  district: "SW4",
  bio: "Early-years nanny.",
  years_experience: 4,
  qualification: "level-3",
  certificates: ["paediatric-first-aid"],
  languages: ["English", "French"],
  has_car: false,
  has_driving_licence: true,
  is_non_smoker: true,
  comfortable_with_pets: null,
  hourly_rate_min_pence: 1500,
  availability: { monday: ["morning", "midday"], "1": ["evening"], junk: "x" },
  available_from: null,
  verification_level: "L3_PROVISIONALLY_VERIFIED",
  profile_picture_object: "photo.jpg",
  ...over,
});

const matchingOver = (
  rows: ReadonlyArray<Record<string, unknown>>,
  leads: ReadonlyArray<Record<string, unknown>> = [],
) =>
  createMatching({
    auth: stubAuth({ tables: { nanny_public: rows, parent_leads: leads } }),
  });

beforeEach(() => {
  configureScoring(
    createScoring({ distance: stubDistanceProvider(), config: MATCHING }),
  );
});

describe("matching inside — the marketplace-safe read (07 §5.2 `nanny_public`)", () => {
  it("shapes a view row for a screen: first name, area ref, blocks, signed photo, no rate", async () => {
    const result = await matchingOver([publicRow(NANNY_A)]).listPublicNannies();
    expect(result.ok).toBe(true);
    const nanny = result.ok ? result.value[0] : undefined;
    expect(nanny).toMatchObject({
      nannyId: NANNY_A,
      firstName: "Amara",
      area: { area: "Clapham", district: "SW4" },
      hasDrivingLicence: true,
      verificationLevel: "L3_PROVISIONALLY_VERIFIED",
    });
    expect(nanny?.availability).toEqual([
      { day: 0, part: "morning" },
      { day: 0, part: "midday" },
      { day: 1, part: "evening" },
    ]);
    expect(nanny?.photoUrl).toContain(
      `profile-pictures/nanny/${NANNY_A}/photo.jpg`,
    );
    expect(nanny).not.toHaveProperty("hourlyRateMinPence");
    expect(JSON.stringify(nanny)).not.toContain("1500");
  });

  it("drops a row a screen cannot show and answers null for an unknown id", async () => {
    const m = matchingOver([
      publicRow(NANNY_A, { first_name: null }),
      publicRow(NANNY_B),
    ]);
    const list = await m.listPublicNannies();
    expect(list.ok && list.value.map((n) => n.nannyId)).toEqual([NANNY_B]);
    const missing = await m.getPublicNanny(NANNY_A as NannyId);
    expect(missing).toEqual({ ok: true, value: null });
  });

  it("maps the display shape to the scoring snapshot with the rung and the ordinal level", () => {
    const nanny: PublicNanny = {
      nannyId: NANNY_A as NannyId,
      firstName: "Amara",
      area: { area: "Clapham", district: "SW4" },
      photoUrl: null,
      bio: null,
      yearsExperience: null,
      qualification: "Level 3 childcare",
      certificates: [],
      languages: [],
      hasCar: true,
      hasDrivingLicence: false,
      isNonSmoker: null,
      comfortableWithPets: true,
      availability: [],
      availableFrom: null,
      verificationLevel: "L4_FULLY_VERIFIED",
    };
    expect(toCandidate(nanny)).toMatchObject({
      experienceYears: 0,
      qualificationRung: 3,
      verificationLevel: 4,
      isolated: false,
      attributes: { car: true, licence: false, pets: true, nonSmoker: false },
    });
  });

  it("fails closed when the port cannot read the view — never an empty result set", async () => {
    const m = createMatching({ auth: stubAuth() });
    const result = await m.quickMatch(null, {
      area: "Clapham",
      district: "SW4",
    });
    expect(result.ok && result.value.total).toBe(0);
    const broken = createMatching({
      auth: {
        ...stubAuth(),
        data: {
          run: async () => ({
            ok: false as const,
            error: { code: "INTERNAL" as const, message: "down", details: {} },
          }),
          signUrl: async () => ({
            ok: false as const,
            error: { code: "INTERNAL" as const, message: "down", details: {} },
          }),
        },
      },
    });
    const failed = await broken.quickMatch(null, {
      area: "Clapham",
      district: "SW4",
    });
    expect(failed.ok).toBe(false);
  });
});

describe("matching inside — quick match + pre-auth through scoring (03 §7.2)", () => {
  it("ranks the view's nannies for the front door's schedule", async () => {
    const m = matchingOver([
      publicRow(NANNY_A),
      publicRow(NANNY_B, { availability: {}, district: "W5", area: "Ealing" }),
    ]);
    const result = await m.quickMatch(
      quickMatchSchedule({ days: [0], parts: ["morning"] }),
      { area: "Clapham", district: "SW4" },
    );
    expect(result.ok && result.value.total).toBe(2);
    expect(result.ok && result.value.top[0]?.nannyId).toBe(NANNY_A);
    expect(result.ok && result.value.top[0]?.scheduleOverlapPct).toBe(100);
  });

  it("scores a lead form over the same candidates", async () => {
    const m = matchingOver([publicRow(NANNY_A)]);
    const result = await m.preAuthMatch({
      area: { area: "Clapham", district: "SW4" },
      children: [{ ageLabel: "1–2 years" }],
      schedule: null,
      requirements: { licence: true },
    });
    expect(result.ok && result.value).toHaveLength(1);
    expect(result.ok && result.value[0]?.unmet).toEqual([]);
  });

  it("answers `not-built` for `resultsFor` rather than a fabricated result", async () => {
    const m = matchingOver([]);
    const results = await m.resultsFor("p" as never, {
      kind: "system",
      id: "dfy-waves",
    });
    expect(!results.ok && results.error.details).toEqual({
      reason: "not-built",
    });
  });

  // `1e` built `autofire`. With `positions` unconfigured it forwards **that module's** fail-closed refusal
  // rather than dressing it as its own — the reading `MatchingResult` records (types.ts).
  it("forwards positions' refusal from `autofire` when the stage model is not configured", async () => {
    const fired = await matchingOver([]).autofire("p" as never, {
      kind: "system",
      id: "dfy-waves",
    });
    expect(!fired.ok && fired.error.details).toEqual({
      reason: "positions-not-configured",
    });
  });
});

describe("matching inside — the wizard lead (02 §4.7 parent_leads)", () => {
  it("saves progressively (insert, then update) and reads back the current answers", async () => {
    const m = matchingOver([]);
    const first = await m.saveLead({
      id: LEAD,
      answers: { area: { area: "Clapham", district: "SW4" } },
      source: "adv",
      completed: false,
    });
    expect(first).toEqual({ ok: true, value: undefined });
    await m.saveLead({
      id: LEAD,
      answers: {
        area: { area: "Clapham", district: "SW4" },
        days: [0, 4],
        parts: ["morning"],
      },
      source: "adv",
      completed: true,
    });
    const lead = await m.getLead(LEAD);
    expect(lead.ok && lead.value).toMatchObject({
      id: LEAD,
      area: { area: "Clapham", district: "SW4" },
      source: "adv",
      completed: true,
      answers: { days: [0, 4], parts: ["morning"] },
    });
    expect(
      await m.getLead("dddddddd-dddd-4ddd-8ddd-dddddddddddd" as LeadId),
    ).toEqual({ ok: true, value: null });
  });

  it("reads a stored row whose form_data is malformed as null, never a half-parsed lead", async () => {
    const m = matchingOver(
      [],
      [
        {
          id: LEAD,
          form_data: { days: ["monday"] },
          district: null,
          area: null,
          source: null,
        },
      ],
    );
    const lead = await m.getLead(LEAD);
    expect(lead).toEqual({ ok: true, value: null });
  });

  // ── ADR-146 (2) — `parent_leads.email` (`0020`) ───────────────────────────────────────────────────────────
  //
  // The column exists so ADR-145 (2)'s case-insensitive match has something to compare. These claims are about
  // the **writer**: the column's `citext` type protects the comparison, and the fold protects the stored value,
  // so the operator's CRM never shows two spellings of one family and a reader that is not `citext`-aware
  // still compares like with like.
  it("stores a captured email folded and trimmed, and reads it back on the lead", async () => {
    const m = matchingOver([]);
    await m.saveLead({
      id: LEAD,
      answers: { area: { area: "Clapham", district: "SW4" } },
      source: "adv",
      completed: false,
      email: "  ADA@Example.TEST  ",
    });
    const lead = await m.getLead(LEAD);
    expect(lead.ok && lead.value?.email).toBe("ada@example.test");
  });

  it("a wizard-only lead carries no email — null, never an empty string", async () => {
    const m = matchingOver([]);
    await m.saveLead({
      id: LEAD,
      answers: { area: { area: "Clapham", district: "SW4" } },
      source: "adv",
      completed: false,
    });
    const lead = await m.getLead(LEAD);
    expect(lead.ok && lead.value?.email).toBeNull();
  });

  it("a blank captured email is stored as null, so `carries an email` stays a real question", async () => {
    const m = matchingOver([]);
    await m.saveLead({
      id: LEAD,
      answers: { area: { area: "Clapham", district: "SW4" } },
      source: "adv",
      completed: false,
      email: "   ",
    });
    const lead = await m.getLead(LEAD);
    expect(lead.ok && lead.value?.email).toBeNull();
  });
});

describe("matching — the Connect entry point (ADR-126; 04 §3.3 (d))", () => {
  const parent: Session = {
    userId: "u" as UserId,
    role: "parent",
    mfaVerified: false,
    expiresAt: "2030-01-01T00:00:00.000Z" as never,
  };

  it("sends a guest to S-X-03's first question with the nanny (and lead) remembered", () => {
    expect(
      connectDecision({
        nannyId: NANNY_A as NannyId,
        session: null,
        leadId: null,
      }),
    ).toEqual({
      kind: "redirect",
      to: `/matchmaking/onboarding?nanny=${NANNY_A}`,
    });
    expect(
      connectDecision({
        nannyId: NANNY_A as NannyId,
        session: null,
        leadId: LEAD,
      }).to,
    ).toBe(`/matchmaking/onboarding?nanny=${NANNY_A}&lead=${LEAD}`);
  });

  it("sends a signed-in parent to S-P-07, and any other role to its own dashboard", () => {
    expect(
      connectDecision({
        nannyId: NANNY_A as NannyId,
        session: parent,
        leadId: null,
      }).to,
    ).toBe(`/parent/browse/${NANNY_A}`);
    expect(
      connectDecision({
        nannyId: NANNY_A as NannyId,
        session: { ...parent, role: "nanny" },
        leadId: null,
      }).to,
    ).toBe("/nanny");
  });

  it("is the one road public-site takes: the connector answers the same decision", async () => {
    const m = matchingOver([]);
    const decision = await m.connect({
      nannyId: NANNY_A as NannyId,
      surface: "browse",
      session: null,
      leadId: null,
    });
    expect(decision.ok && decision.value.kind).toBe("redirect");
  });
});
