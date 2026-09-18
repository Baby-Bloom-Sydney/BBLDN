// S-N-17 `/nanny/profile` (`03.22` Rejig; 04 §6.3 "complete · incomplete → S-N-18") and S-N-21 `/nanny/settings`
// (`03.24` Rejig, payouts dropped — N-2), as the two pure views behind them.
//
// **The one rule that governs both** (the planner's ruling, on ADR-157's silent hold): the profile shows the
// nanny her **own** completeness and her **own** next step, and **never names the hold**. A held nanny — one at
// L3 with the level-4 Update Service check still to come — sees exactly what a nanny mid-check sees, because
// neither view is given anything to branch on: their whole input is her profile row and `verification.getStatus`.
// There is no held flag in this module, and the suite holds that shape as well as the words.
//
// The level is **read, never derived** (`2c`'s first rule): `VerificationState.level` is what `getStatus`
// answers, and nothing here recomputes it from the sections.
//
// Written RED: neither view existed.
import { describe, expect, it } from "vitest";
import type { VerificationState } from "@/modules/verification";
import type { E164, Email, NannyId, UserId } from "@/modules/shared-types";
import type { NannyProfile } from "../types";
import { nannyProfileView } from "../lib/nanny-profile-view";
import { nannySettingsView } from "../lib/nanny-settings-view";

const USER = "22222222-2222-4222-8222-222222222222" as UserId;

const profile = (over: Partial<NannyProfile> = {}): NannyProfile =>
  Object.freeze({
    userId: USER,
    nannyId: "n-1" as NannyId,
    firstName: "Amara",
    lastName: "Okafor",
    email: "amara@example.test" as Email,
    mobile: "+447700900123" as E164, // config-literal-ok: a row fixture, not a policy
    district: "SW4",
    area: "Clapham",
    bio: "Ten years with under-threes.",
    yearsExperience: 10,
    qualification: "level-3",
    certificates: ["paediatric-first-aid"],
    languages: ["English"],
    hasCar: true,
    hasDrivingLicence: true,
    isNonSmoker: true,
    comfortableWithPets: false,
    hourlyRateMinPence: 1800, // config-literal-ok: a row fixture, not a price
    availability: { monday: ["morning"] },
    isIsolated: false,
    verificationLevel: "L3_PROVISIONALLY_VERIFIED",
    profileVisible: true,
    ...over,
  }) as NannyProfile;

const status = (
  level: VerificationState["level"],
  sections: VerificationState["sections"] = [],
): VerificationState =>
  Object.freeze({
    nannyId: USER,
    level,
    suspended: false,
    sections,
  }) as VerificationState;

const all = (
  s:
    | "not_started"
    | "pending"
    | "processing"
    | "verified"
    | "review"
    | "rejected",
): VerificationState["sections"] =>
  (["contact", "identity", "dbs", "right-to-work"] as const).map((section) => ({
    section,
    status: s,
  })) as VerificationState["sections"];

const words = (view: { readonly [k: string]: unknown }): string =>
  JSON.stringify(view).toLowerCase();

const FORBIDDEN = /hold|held|withheld|not yet shown|hidden from famil/;

describe("S-N-17 — the nanny's own profile (04 §6.3; `03.22`)", () => {
  it("says she is complete when the database's own rule says so", () => {
    const view = nannyProfileView(
      profile(),
      status("L3_PROVISIONALLY_VERIFIED", all("verified")),
    );

    expect(view.complete).toBe(true);
    expect(view.nextStep).toBeNull();
  });

  it("names her own next step when something is missing, and links into S-N-18 at that step", () => {
    const view = nannyProfileView(
      profile({ bio: undefined, hourlyRateMinPence: undefined }),
      status("L1_REGISTERED", all("not_started")),
    );

    expect(view.complete).toBe(false);
    expect(view.nextStep?.stepIndex).toBe(8); // `rate` comes before `about-you` in PROFILE_STEPS
    expect(view.missing.map((m) => m.stepIndex)).toEqual([8, 9]);
  });

  it("reads the level rather than deriving one (`2c` rule 1)", () => {
    // sections all verified, but the writer says L2 — the view must say what the writer says
    const view = nannyProfileView(
      profile(),
      status("L2_ID_VERIFIED", all("verified")),
    );

    expect(view.verification.level).toBe("L2_ID_VERIFIED");
  });

  it("★ never names the hold: an L3 nanny (held) and a mid-check nanny read the same neutral state", () => {
    const held = nannyProfileView(
      profile(),
      status("L3_PROVISIONALLY_VERIFIED", all("verified")),
    );
    const midCheck = nannyProfileView(
      profile(),
      status("L3_PROVISIONALLY_VERIFIED", all("processing")),
    );

    expect(words(held)).not.toMatch(FORBIDDEN);
    expect(words(midCheck)).not.toMatch(FORBIDDEN);
    // and neither view is told anything about a connection at all
    expect(words(held)).not.toContain("connection");
  });

  it("no level says anything about a hold, at any section state", () => {
    const levels = [
      "L0_SIGNED_UP",
      "L1_REGISTERED",
      "L2_ID_VERIFIED",
      "L3_PROVISIONALLY_VERIFIED",
      "L4_FULLY_VERIFIED",
    ] as const;
    for (const level of levels)
      for (const s of [
        "not_started",
        "pending",
        "processing",
        "verified",
        "review",
        "rejected",
      ] as const)
        expect(
          words(nannyProfileView(profile(), status(level, all(s)))),
        ).not.toMatch(FORBIDDEN);
  });

  it("carries the DBS badge from the DBS section and nothing else", () => {
    const verified = nannyProfileView(
      profile(),
      status("L3_PROVISIONALLY_VERIFIED", all("verified")),
    );
    const open = nannyProfileView(
      profile(),
      status("L1_REGISTERED", all("not_started")),
    );

    expect(verified.verification.dbs).toBe("verified");
    expect(open.verification.dbs).toBe("not_started");
  });

  it("shows her rate in the config currency and her area with its district", () => {
    const view = nannyProfileView(
      profile(),
      status("L3_PROVISIONALLY_VERIFIED"),
    );

    expect(view.rateLine).toContain("£"); // config-literal-ok: the claim IS that LOCALE.currency is rendered
    expect(view.rateLine).toContain("18");
    expect(view.areaLine).toBe("Clapham · SW4");
  });

  it("a section that needs her carries the action, and it points at the wizard", () => {
    const view = nannyProfileView(
      profile(),
      status("L1_REGISTERED", [
        {
          section: "identity",
          status: "rejected",
          rejectionReason: "mismatch",
        },
      ] as VerificationState["sections"]),
    );

    expect(view.verification.needsHer).toBe(true);
  });
});

describe("S-N-21 — settings (04 §6.3; `03.24`, payouts dropped — N-2)", () => {
  it("offers the five sections 04 §6.3 lists and no sixth", () => {
    const view = nannySettingsView(
      profile(),
      status("L3_PROVISIONALLY_VERIFIED"),
    );

    expect(view.sections.map((s) => s.id)).toEqual([
      "profile",
      "account",
      "children",
      "help",
      "close",
    ]);
  });

  it("★ no payout section and no commission figure anywhere (N-2; T-2.5)", () => {
    const view = nannySettingsView(
      profile(),
      status("L4_FULLY_VERIFIED", all("verified")),
    );

    expect(words(view)).not.toMatch(/payout|bank|sort code|commission rate|%/);
  });

  it("carries her contact details for the form, and the form is S-N-18's location step", () => {
    const view = nannySettingsView(
      profile(),
      status("L3_PROVISIONALLY_VERIFIED"),
    );

    expect(view.contact).toEqual({
      mobile: "+447700900123", // config-literal-ok: read back from the fixture above
      district: "SW4",
      area: "Clapham",
    });
    expect(view.contactStepIndex).toBe(0);
  });

  it("lists the three verification rows in 04 §6.3's order, by status alone", () => {
    const view = nannySettingsView(
      profile(),
      status("L2_ID_VERIFIED", [
        { section: "identity", status: "verified" },
        { section: "dbs", status: "processing" },
        { section: "right-to-work", status: "not_started" },
      ] as VerificationState["sections"]),
    );

    expect(view.verificationRows.map((r) => r.section)).toEqual([
      "identity",
      "dbs",
      "right-to-work",
    ]);
    expect(view.verificationRows.map((r) => r.status)).toEqual([
      "verified",
      "processing",
      "not_started",
    ]);
  });

  it("★ never names the hold either, at any level", () => {
    for (const level of [
      "L0_SIGNED_UP",
      "L3_PROVISIONALLY_VERIFIED",
      "L4_FULLY_VERIFIED",
    ] as const)
      expect(
        words(nannySettingsView(profile(), status(level, all("verified")))),
      ).not.toMatch(FORBIDDEN);
  });

  it("an isolated nanny is not offered the commission road (ADR-147)", () => {
    const view = nannySettingsView(
      profile({ isIsolated: true }),
      status("L0_SIGNED_UP"),
    );

    expect(words(view)).not.toContain("commission");
  });

  it("closing an account is a conversation, not a button — and says so", () => {
    const view = nannySettingsView(
      profile(),
      status("L3_PROVISIONALLY_VERIFIED"),
    );
    const close = view.sections.find((s) => s.id === "close");

    expect(close?.href).toBe("/contact");
  });
});
