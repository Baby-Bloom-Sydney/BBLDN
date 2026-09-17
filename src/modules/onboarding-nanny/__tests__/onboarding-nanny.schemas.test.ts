// 01 §4a — validated once, at the boundary. The three funnel schemas and the account schema: what each refuses,
// which field the summary names, and the one normalisation (the UK mobile, ADR-102). RED first (ADR-123 rule 1).
import { describe, expect, it } from "vitest";
import { LOCALE, SECURITY } from "@/modules/config";
import { nannyApplicationSchema } from "../lib/nanny-application-schema";
import { nannyPortfolioSchema } from "../lib/nanny-portfolio-schema";
import { nannyBioSchema } from "../lib/nanny-bio-schema";
import { nannySignupSchema } from "../lib/nanny-signup-schema";

const APPLICATION = {
  firstName: "Amara",
  lastName: "Okafor",
  email: "Amara@Example.test",
  mobile: "07700 900123",
  district: "SW4",
  area: "Clapham",
  rtwStatus: "citizen",
  hasEnhancedDbs: "yes",
  yearsExperience: "6",
  ageGroups: ["babies", "toddlers"],
};

const firstIssue = (result: {
  success: boolean;
  error?: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }> };
}) => (result.success ? null : String(result.error?.issues[0]?.path[0]));

describe("onboarding-nanny — nannyApplicationSchema (S-X-15, 04 §4.1 rows 2–5)", () => {
  it("accepts the London answers and normalises the mobile to E.164 with the config prefix", () => {
    const parsed = nannyApplicationSchema.safeParse(APPLICATION);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.mobile).toBe(`${LOCALE.phonePrefix}7700900123`);
    expect(parsed.data.email).toBe("amara@example.test");
    expect(parsed.data.hasEnhancedDbs).toBe(true);
    expect(parsed.data.yearsExperience).toBe(6);
    expect(parsed.data.ageGroups).toEqual(["babies", "toddlers"]);
  });

  it.each([
    [{ mobile: "0412 345 678" }, "mobile"],
    [{ district: "" }, "district"],
    [{ rtwStatus: "australian" }, "rtwStatus"],
    [{ hasEnhancedDbs: "maybe" }, "hasEnhancedDbs"],
    [{ yearsExperience: "sixty-one" }, "yearsExperience"],
    [{ yearsExperience: "61" }, "yearsExperience"],
    [{ ageGroups: ["teens"] }, "ageGroups"],
    [{ email: "not-an-email" }, "email"],
    [{ firstName: " " }, "firstName"],
  ])("refuses %j naming %s", (patch, field) => {
    expect(
      firstIssue(
        nannyApplicationSchema.safeParse({ ...APPLICATION, ...patch }),
      ),
    ).toBe(field);
  });

  it("a 'no' to the Enhanced DBS question is a valid answer — the stop is the screen's, not the schema's", () => {
    const parsed = nannyApplicationSchema.safeParse({
      ...APPLICATION,
      hasEnhancedDbs: "no",
    });
    expect(parsed.success && parsed.data.hasEnhancedDbs).toBe(false);
  });
});

describe("onboarding-nanny — nannyPortfolioSchema (S-X-17)", () => {
  const PORTFOLIO = {
    roleTypes: ["full-time", "nanny-share"],
    availability: JSON.stringify({
      monday: ["morning", "afternoon"],
      sunday: [],
    }),
    rateMin: "15",
    rateMax: "20",
  };

  it("parses the rate band into pence and the availability grid into the one shared shape", () => {
    const parsed = nannyPortfolioSchema.safeParse(PORTFOLIO);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.rateBand).toEqual({ minPence: 1500, maxPence: 2000 }); // config-literal-ok: a fixture's own rate, not a PRICES value
    expect(parsed.data.availability).toEqual({
      monday: ["morning", "afternoon"],
    });
    expect(parsed.data.roleTypes).toEqual(["full-time", "nanny-share"]);
  });

  it.each([
    [{ rateMin: "25", rateMax: "20" }, "rateMax"],
    [{ rateMin: "0" }, "rateMin"],
    [{ roleTypes: [] }, "roleTypes"],
    [{ roleTypes: ["babysitting"] }, "roleTypes"],
    [{ availability: JSON.stringify({ monday: ["night"] }) }, "availability"],
    [{ availability: "not json" }, "availability"],
    [{ availability: JSON.stringify({}) }, "availability"],
  ])("refuses %j naming %s", (patch, field) => {
    expect(
      firstIssue(nannyPortfolioSchema.safeParse({ ...PORTFOLIO, ...patch })),
    ).toBe(field);
  });
});

describe("onboarding-nanny — nannyBioSchema (S-X-18)", () => {
  it("needs a few sentences, not a word", () => {
    expect(firstIssue(nannyBioSchema.safeParse({ bio: "Hi" }))).toBe("bio");
    expect(
      nannyBioSchema.safeParse({
        bio: "Ten years with under-fives across south London.",
      }).success,
    ).toBe(true);
  });
});

describe("onboarding-nanny — nannySignupSchema (S-X-19 / S-X-07)", () => {
  const PASSWORD = "a".repeat(SECURITY.password.minLength);
  const APPLY = {
    path: "apply",
    password: PASSWORD,
    confirmPassword: PASSWORD,
    consent: "on",
  };

  it("the /apply road needs only the password and the AGR-02 tick — name and email are the lead's", () => {
    expect(nannySignupSchema.safeParse(APPLY).success).toBe(true);
  });

  it("the invite road needs the name and the email too", () => {
    expect(
      firstIssue(nannySignupSchema.safeParse({ ...APPLY, path: "invite" })),
    ).toBe("firstName");
    expect(
      nannySignupSchema.safeParse({
        ...APPLY,
        path: "invite",
        firstName: "Amara",
        lastName: "Okafor",
        email: "amara@example.test",
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ password: "short", confirmPassword: "short" }, "password"],
    [{ confirmPassword: "different-password!!" }, "confirmPassword"],
    [{ consent: "" }, "consent"],
  ])("refuses %j naming %s", (patch, field) => {
    expect(
      firstIssue(nannySignupSchema.safeParse({ ...APPLY, ...patch })),
    ).toBe(field);
  });

  it("an unknown path falls back to /apply rather than refusing", () => {
    const parsed = nannySignupSchema.safeParse({ ...APPLY, path: "elsewhere" });
    expect(parsed.success && parsed.data.path).toBe("apply");
  });
});
