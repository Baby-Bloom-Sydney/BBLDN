// The two `onboarding-nanny` adapters (L-008 `2a`), asserted on what they say to the port: the account side is
// `0021`'s three definers at **session** scope with the camel → snake column map (ADR-152), the lead side is
// `nanny_leads` at **service** scope with 02 §4.7's two rules (overwrite the unconverted, "sign in instead" for
// an address that has an account). The functions' behaviour is `int.rpc-0021`'s; this is the wiring.
import { describe, expect, it } from "vitest";
import { LOCALE } from "@/modules/config";
import type { E164, Email, LeadId, UserId } from "@/modules/shared-types";
import { dbNannyAccountStore } from "../db-nanny-account-store";
import { dbNannyLeadStore } from "../db-nanny-lead-store";
import { fakeDataPort } from "./fixtures/fake-data-port";

const MOBILE = `${LOCALE.phonePrefix}7700900123` as E164;
const USER = "22222222-2222-4222-8222-222222222222" as UserId;
const currentUser = async () => ({ ok: true as const, value: USER });

const APPLICATION = {
  firstName: "Amara",
  lastName: "Okafor",
  email: "amara@example.test" as Email,
  mobile: MOBILE,
  district: "SW4",
  area: "Clapham",
  rtwStatus: "citizen" as const,
  hasEnhancedDbs: true,
  yearsExperience: 6,
  ageGroups: ["babies" as const],
  source: "apply" as const,
};

describe("dbNannyAccountStore — 0021's definers at session scope (ADR-152)", () => {
  it("create → create_nanny_account with is_isolated from the input and the profile in snake case", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => ({ nanny_id: "n-1", lead_converted: true });
    const result = await dbNannyAccountStore(fake.port, currentUser).create({
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never,
      firstName: "Amara",
      lastName: "Okafor",
      isolated: false,
      mobile: MOBILE,
      district: "SW4",
      area: "Clapham",
      leadId: "l-1" as LeadId,
      profile: { yearsExperience: 6, hourlyRateMinPence: 1500, bio: "A bio." }, // config-literal-ok: a fixture's own rate, not a PRICES value
    });
    expect(result).toEqual({
      ok: true,
      value: { nannyId: "n-1", leadConverted: true },
    });
    expect(fake.rpcs).toEqual([
      {
        name: "create_nanny_account",
        args: {
          p_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          p_first_name: "Amara",
          p_last_name: "Okafor",
          p_isolated: false,
          p_mobile: MOBILE,
          p_district: "SW4",
          p_area: "Clapham",
          p_lead_id: "l-1",
          p_profile: {
            years_experience: 6,
            hourly_rate_min_pence: 1500,
            bio: "A bio.",
          }, // config-literal-ok: the same fixture, echoed
        },
      },
    ]);
    // ADR-163: the definer is service_role only and acts for p_user_id
    expect(fake.calls[0]?.scope).toBe("service");
    expect(fake.inserted).toEqual([]);
  });

  it("an invited nanny's create carries isolated: true and omits what she did not give", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => ({ nanny_id: "n-2", lead_converted: false });
    await dbNannyAccountStore(fake.port, currentUser).create({
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never,
      firstName: "Bea",
      lastName: "Lin",
      isolated: true,
    });
    expect(fake.rpcs[0]?.args).toEqual({
      p_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      p_first_name: "Bea",
      p_last_name: "Lin",
      p_isolated: true,
      p_mobile: undefined,
      p_district: undefined,
      p_area: undefined,
      p_lead_id: undefined,
      p_profile: {},
    });
  });

  it("liftIsolation → lift_nanny_isolation, answering the boolean the function returned", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => true;
    expect(
      await dbNannyAccountStore(fake.port, currentUser).liftIsolation(),
    ).toEqual({ ok: true, value: true });
    expect(fake.rpcs[0]?.name).toBe("lift_nanny_isolation");
    expect(fake.calls[0]?.scope).toBe("session");
  });

  it("updateProfile → update_nanny_profile with both halves in snake case; the completeness is the database's", async () => {
    const fake = fakeDataPort();
    fake.state.rpcAnswer = () => true;
    const result = await dbNannyAccountStore(
      fake.port,
      currentUser,
    ).updateProfile({
      profile: {
        qualification: "level-3",
        hasCar: true,
        availability: { monday: ["morning"] },
      },
      contact: { district: "SW4", area: "Clapham", mobile: MOBILE },
    });
    expect(result).toEqual({ ok: true, value: { complete: true } });
    expect(fake.rpcs[0]).toEqual({
      name: "update_nanny_profile",
      args: {
        p_profile: {
          qualification: "level-3",
          has_car: true,
          availability: { monday: ["morning"] },
        },
        p_contact: { district: "SW4", area: "Clapham", mobile: MOBILE },
      },
    });
  });

  it("get reads the nanny's own two rows by user id at session scope and maps them; null without a row", async () => {
    const fake = fakeDataPort({
      nannies: [
        {
          id: "n-1",
          user_id: USER,
          bio: "A bio.",
          years_experience: 6,
          qualification: "level-3",
          certificates: ["paediatric-first-aid"],
          languages: [],
          has_car: null,
          has_driving_licence: true,
          is_non_smoker: null,
          comfortable_with_pets: null,
          hourly_rate_min_pence: 1500, // config-literal-ok: a row fixture
          availability: { monday: ["morning"] },
          available_from: null,
          is_isolated: true,
          verification_level: "L0_SIGNED_UP",
          profile_visible: false,
        },
      ],
      user_profiles: [
        {
          user_id: USER,
          first_name: "Amara",
          last_name: "Okafor",
          email: "amara@example.test",
          mobile: MOBILE,
          district: "SW4",
          area: "Clapham",
          date_of_birth: null,
        },
      ],
    });
    const result = await dbNannyAccountStore(fake.port, currentUser).get();
    expect(result).toEqual({
      ok: true,
      value: {
        userId: USER,
        nannyId: "n-1",
        firstName: "Amara",
        lastName: "Okafor",
        email: "amara@example.test",
        mobile: MOBILE,
        district: "SW4",
        area: "Clapham",
        bio: "A bio.",
        yearsExperience: 6,
        qualification: "level-3",
        certificates: ["paediatric-first-aid"],
        languages: [],
        hasDrivingLicence: true,
        hourlyRateMinPence: 1500, // config-literal-ok: the same row, read back
        availability: { monday: ["morning"] },
        isIsolated: true,
        verificationLevel: "L0_SIGNED_UP",
        profileVisible: false,
      },
    });
    expect(fake.keyedReads.map((r) => [r.table, r.column])).toEqual([
      ["nannies", "user_id"],
      ["user_profiles", "user_id"],
    ]);
    expect(fake.calls[0]?.scope).toBe("session");

    const empty = await dbNannyAccountStore(
      fakeDataPort().port,
      currentUser,
    ).get();
    expect(empty).toEqual({ ok: true, value: null });
    const signedOut = await dbNannyAccountStore(fake.port, async () => ({
      ok: true as const,
      value: null,
    })).get();
    expect(signedOut).toEqual({ ok: true, value: null });
  });
});

describe("dbNannyLeadStore — nanny_leads at service scope (02 §4.7; 07 §5.1 rule 5)", () => {
  it("a fresh address inserts one row with a minted id and answers `created`", async () => {
    const fake = fakeDataPort();
    const result = await dbNannyLeadStore(fake.port).capture(APPLICATION);
    expect(result.ok && result.value.state).toBe("created");
    expect(fake.inserted).toHaveLength(1);
    const row = fake.inserted[0]?.row as Record<string, unknown>;
    expect(String(row.id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.id).toBe(result.ok ? result.value.leadId : "");
    expect(row).toMatchObject({
      email: "amara@example.test",
      phone: MOBILE,
      district: "SW4",
      right_to_work_status: "citizen",
      qualifications: { has_enhanced_dbs: true },
      experience: { years: 6, age_groups: ["babies"] },
      lead_signals: { under_three: true },
      source: "apply",
      funnel_step: "S-X-15",
    });
    expect(fake.calls.every((c) => c.scope === "service")).toBe(true);
  });

  it("an address on user_profiles answers `has-account` and writes nothing (04 §4.1 row 5)", async () => {
    const fake = fakeDataPort({
      user_profiles: [{ user_id: USER, email: "amara@example.test" }],
    });
    const result = await dbNannyLeadStore(fake.port).capture(APPLICATION);
    expect(result.ok && result.value.state).toBe("has-account");
    expect(fake.inserted).toEqual([]);
    expect(fake.updated).toEqual([]);
  });

  it("an unconverted lead under the same address is overwritten in place; a converted one is `has-account`", async () => {
    const open = fakeDataPort({
      nanny_leads: [
        { id: "l-1", email: "amara@example.test", converted_at: null },
      ],
    });
    const overwritten = await dbNannyLeadStore(open.port).capture({
      ...APPLICATION,
      yearsExperience: 9,
    });
    expect(overwritten).toEqual({
      ok: true,
      value: { leadId: "l-1", state: "updated" },
    });
    expect(open.updated[0]).toMatchObject({ table: "nanny_leads", id: "l-1" });
    expect(open.inserted).toEqual([]);

    const converted = fakeDataPort({
      nanny_leads: [
        {
          id: "l-1",
          email: "amara@example.test",
          converted_at: "2026-09-18T00:00:00Z",
        },
      ],
    });
    const refused = await dbNannyLeadStore(converted.port).capture(APPLICATION);
    expect(refused).toEqual({
      ok: true,
      value: { leadId: "l-1", state: "has-account" },
    });
    expect(converted.updated).toEqual([]);
  });

  it("patch writes the jsonb sections 02 §4.7 names, and get reads them back", async () => {
    const fake = fakeDataPort();
    await dbNannyLeadStore(fake.port).patch("l-1" as LeadId, {
      roleTypes: ["full-time"],
      availability: { monday: ["morning"] },
      rateBand: { minPence: 1500, maxPence: 2000 }, // config-literal-ok: a fixture's own rate, not a PRICES value
      bio: "A bio.",
      funnelStep: "S-X-18",
    });
    expect(fake.updated[0]).toMatchObject({
      table: "nanny_leads",
      id: "l-1",
      patch: {
        preferences: { role_types: ["full-time"] },
        availability: { monday: ["morning"] },
        salary: { min_pence: 1500, max_pence: 2000, currency: LOCALE.currency }, // config-literal-ok: the same fixture, echoed
        about_you: { bio: "A bio." },
        funnel_step: "S-X-18",
      },
    });

    const seeded = fakeDataPort({
      nanny_leads: [
        {
          id: "l-1",
          email: "amara@example.test",
          first_name: "Amara",
          last_name: "Okafor",
          phone: MOBILE,
          district: "SW4",
          area: "Clapham",
          right_to_work_status: "citizen",
          qualifications: { has_enhanced_dbs: true },
          experience: { years: 6, age_groups: ["babies"] },
          preferences: { role_types: ["full-time"] },
          availability: { monday: ["morning"] },
          salary: { min_pence: 1500, max_pence: 2000 }, // config-literal-ok: a row fixture
          about_you: { bio: "A bio." },
          lead_status: "applied",
          source: "apply",
          converted_at: null,
        },
      ],
    });
    const read = await dbNannyLeadStore(seeded.port).get("l-1" as LeadId);
    expect(read).toEqual({
      ok: true,
      value: {
        id: "l-1",
        email: "amara@example.test",
        firstName: "Amara",
        lastName: "Okafor",
        mobile: MOBILE,
        district: "SW4",
        area: "Clapham",
        rtwStatus: "citizen",
        hasEnhancedDbs: true,
        yearsExperience: 6,
        ageGroups: ["babies"],
        roleTypes: ["full-time"],
        availability: { monday: ["morning"] },
        rateBand: { minPence: 1500, maxPence: 2000 }, // config-literal-ok: the same row, read back
        bio: "A bio.",
        status: "applied",
        source: "apply",
      },
    });
  });
});
