// The pure pieces: the step lists per mode, the completeness rule (`03.18`, mirrored from `0021`'s SQL), the
// lead → profile projection, the hub view's three states with their 04 §8 lines, and where a nanny goes after
// signup. RED first (ADR-123 rule 1).
import { describe, expect, it } from "vitest";
import { LOCALE, MATCHING } from "@/modules/config";
import type {
  E164,
  Email,
  LeadId,
  NannyId,
  UserId,
} from "@/modules/shared-types";
import type { NannyLead, NannyProfile } from "../types";
import { FUNNEL_STEPS } from "../lib/funnel-steps";
import { PROFILE_STEPS } from "../lib/profile-steps";
import { isNannyProfileComplete } from "../lib/is-nanny-profile-complete";
import { leadToProfile } from "../lib/lead-to-profile";
import { nannyHubView } from "../lib/nanny-hub-view";
import { postNannySignupDestination } from "../lib/post-nanny-signup-destination";

const PROFILE: NannyProfile = {
  userId: "u1" as UserId,
  nannyId: "n1" as NannyId,
  firstName: "Amara",
  lastName: "Okafor",
  email: "amara@example.test" as Email,
  mobile: `${LOCALE.phonePrefix}7700900123` as E164,
  district: "SW4",
  area: "Clapham",
  bio: "Ten years with under-fives.",
  yearsExperience: 10,
  qualification: "level-3",
  hourlyRateMinPence: 1600, // config-literal-ok: a fixture's own rate, not a PRICES value
  availability: { monday: ["morning"] },
  isIsolated: false,
  verificationLevel: "L0_SIGNED_UP",
  profileVisible: false,
};

describe("onboarding-nanny — FUNNEL_STEPS (04 §4.1 rows 1–7; ADR-147 for the portal)", () => {
  it("/apply walks N1's five pages, the interstitial, portfolio, review and the account", () => {
    expect(FUNNEL_STEPS.apply.map((step) => step.id)).toEqual([
      "location",
      "residency",
      "credentials",
      "experience",
      "contact",
      "interstitial",
      "portfolio",
      "review",
      "account",
    ]);
  });

  it("the portal walks the same steps without contact and account — the account already exists", () => {
    expect(FUNNEL_STEPS.portal.map((step) => step.id)).toEqual([
      "location",
      "residency",
      "credentials",
      "experience",
      "interstitial",
      "portfolio",
      "review",
    ]);
  });

  it("every step names its screen id so the h1 can say 'step n of N' for the right screen", () => {
    for (const step of FUNNEL_STEPS.apply)
      expect(step.screen).toMatch(/^S-X-1[5-9]$/);
  });
});

describe("onboarding-nanny — PROFILE_STEPS (S-N-18, `03.17`)", () => {
  it("is ten steps with unique ids and every step names the fields it saves", () => {
    expect(PROFILE_STEPS).toHaveLength(10);
    expect(new Set(PROFILE_STEPS.map((step) => step.id)).size).toBe(10);
    for (const step of PROFILE_STEPS)
      expect(step.fields.length).toBeGreaterThan(0);
  });
});

describe("onboarding-nanny — isNannyProfileComplete (`03.18`; the same rule `update_nanny_profile()` computes)", () => {
  it("is true only when years, qualification, rate, availability, bio, district and mobile are all present", () => {
    expect(isNannyProfileComplete(PROFILE)).toBe(true);
    expect(isNannyProfileComplete({ ...PROFILE, bio: "" })).toBe(false);
    expect(isNannyProfileComplete({ ...PROFILE, mobile: undefined })).toBe(
      false,
    );
    expect(
      isNannyProfileComplete({ ...PROFILE, availability: undefined }),
    ).toBe(false);
    expect(
      isNannyProfileComplete({ ...PROFILE, qualification: undefined }),
    ).toBe(false);
  });
});

describe("onboarding-nanny — leadToProfile (what N5 hands create_nanny_account)", () => {
  const lead: NannyLead = {
    id: "l1" as LeadId,
    email: "amara@example.test" as Email,
    firstName: "Amara",
    lastName: "Okafor",
    mobile: `${LOCALE.phonePrefix}7700900123` as E164,
    district: "SW4",
    area: "Clapham",
    rtwStatus: "citizen",
    hasEnhancedDbs: true,
    yearsExperience: 6,
    ageGroups: ["babies"],
    roleTypes: ["full-time"],
    availability: { monday: ["morning"] },
    rateBand: { minPence: 1500, maxPence: 2000 }, // config-literal-ok: a fixture's own rate, not a PRICES value
    bio: "A bio.",
    status: "applied",
    source: "apply",
  };

  it("carries years, the band's floor as the minimum rate, the availability grid and the bio", () => {
    expect(leadToProfile(lead)).toEqual({
      yearsExperience: 6,
      hourlyRateMinPence: 1500, // config-literal-ok: a fixture's own rate, not a PRICES value
      availability: { monday: ["morning"] },
      bio: "A bio.",
    });
  });

  it("omits what the lead never captured rather than writing nulls", () => {
    expect(
      leadToProfile({
        ...lead,
        yearsExperience: null,
        rateBand: null,
        availability: null,
        bio: null,
      }),
    ).toEqual({});
  });
});

describe("onboarding-nanny — nannyHubView (S-N-11 · S-N-22; 04 §8 anchors)", () => {
  const hrefs = {
    applyHref: "/nanny/apply",
    verificationHref: "/nanny/onboarding-verification",
  };

  it("an isolated nanny sees the S-N-22 line and one action: apply to join", () => {
    const view = nannyHubView(
      { ...PROFILE, isIsolated: true },
      MATCHING.minVerificationLevel,
      hrefs,
    );
    expect(view.state).toBe("isolated");
    expect(view.line).toContain(
      "Want to be matched with more families? Apply to join.",
    );
    expect(view.action).toEqual({
      label: "Apply to join",
      href: "/nanny/apply",
    });
  });

  it("below the configured level the hub is gated and the action is the verification wizard", () => {
    const view = nannyHubView(PROFILE, MATCHING.minVerificationLevel, hrefs);
    expect(view.state).toBe("gated");
    expect(view.action?.href).toBe("/nanny/onboarding-verification");
  });

  it("from the configured level the hub is open and says so in the S-N-11 words", () => {
    const view = nannyHubView(
      { ...PROFILE, verificationLevel: "L3_PROVISIONALLY_VERIFIED" },
      MATCHING.minVerificationLevel,
      hrefs,
    );
    expect(view.state).toBe("open");
    expect(view.line).toBe("Verified — you're in the pool");
    expect(view.action).toBeNull();
  });

  it("isolation wins over the level: a verified but isolated nanny is still isolated (ADR-147)", () => {
    const view = nannyHubView(
      { ...PROFILE, isIsolated: true, verificationLevel: "L4_FULLY_VERIFIED" },
      MATCHING.minVerificationLevel,
      hrefs,
    );
    expect(view.state).toBe("isolated");
  });
});

describe("onboarding-nanny — postNannySignupDestination (04 §4.1 row 7; §4.2 b2)", () => {
  it("/apply → the add-child pitch; an invite → the claim; a bare account → the hub", () => {
    expect(
      postNannySignupDestination({ path: "apply", inviteToken: null }),
    ).toBe("/nanny/onboarding/add-child");
    expect(
      postNannySignupDestination({ path: "invite", inviteToken: "ABCD-2345" }),
    ).toBe("/invite/connect/ABCD-2345");
    expect(
      postNannySignupDestination({ path: "invite", inviteToken: null }),
    ).toBe("/nanny");
  });
});
