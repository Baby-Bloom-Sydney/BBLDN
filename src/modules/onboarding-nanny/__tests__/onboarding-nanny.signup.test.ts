// S-X-19 / S-X-07 — the one signup action behind both roads: from `/apply` the lead cookie names the lead and
// the account is created **not isolated** with the lead converted (ADR-147; 04 §4.1 row 7); from an invite the
// account is created **isolated** and she goes to the claim (04 §4.2 b2; ADR-150); a bare S-X-07 is isolated
// and lands on the hub. AGR-02 is recorded, the welcome is best effort, the events say which road. RED first.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { SECURITY } from "@/modules/config";
import {
  configureConsent,
  configureEvents,
  configureRateLimiter,
  createConsent,
  createEvents,
  createRateLimiter,
  log,
  memoryConsentStore,
  memoryEventLogStore,
  memoryRateLimitStore,
} from "@/modules/platform";
import { cookieJarModule, jarOf, resetJar } from "./cookie-jar";
import { configureNannyLeadStore } from "../lib/configure-nanny-lead-store";
import { memoryNannyLeadStore } from "../lib/memory-nanny-lead-store";
import { configureNannyAccountStore } from "../lib/configure-nanny-account-store";
import { memoryNannyAccountStore } from "../lib/memory-nanny-account-store";
import { NANNY_ACCOUNT_STORE_REGISTRY } from "../lib/nanny-account-store-registry";
import { saveNannyApplicationAction } from "../actions/save-nanny-application-action";
import { saveNannyPortfolioAction } from "../actions/save-nanny-portfolio-action";
import { saveNannyBioAction } from "../actions/save-nanny-bio-action";
import { signUpNannyAction } from "../actions/sign-up-nanny-action";

vi.mock("next/headers", () => cookieJarModule());

const formDataOf = (fields: Record<string, string | ReadonlyArray<string>>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") data.set(key, value);
    else for (const item of value) data.append(key, item);
  }
  return data;
};

const PASSWORD = "a".repeat(SECURITY.password.minLength);
const APPLICATION = {
  firstName: "Amara",
  lastName: "Okafor",
  email: "amara@example.test",
  mobile: "07700 900123",
  district: "SW4",
  area: "Clapham",
  rtwStatus: "citizen",
  hasEnhancedDbs: "yes",
  yearsExperience: "6",
  ageGroups: ["babies"],
};
const APPLY_SIGNUP = { path: "apply", password: PASSWORD, confirmPassword: PASSWORD, consent: "on" };
const INVITE_SIGNUP = {
  ...APPLY_SIGNUP,
  path: "invite",
  firstName: "Bea",
  lastName: "Lin",
  email: "bea@example.test",
};

const LEAD_COOKIE = SECURITY.carriedTokens.nannyLead.name;
const INVITE_COOKIE = SECURITY.carriedTokens.invite.name;
const UNCONFIGURED_ACCOUNTS = NANNY_ACCOUNT_STORE_REGISTRY.get();

let consents: ReturnType<typeof memoryConsentStore>;
let events: ReturnType<typeof memoryEventLogStore>;
let leads: ReturnType<typeof memoryNannyLeadStore>;
let accounts: ReturnType<typeof memoryNannyAccountStore>;

const runFunnelToN4 = async (): Promise<void> => {
  await saveNannyApplicationAction(null, formDataOf(APPLICATION));
  await saveNannyPortfolioAction(
    null,
    formDataOf({ roleTypes: ["full-time"], availability: JSON.stringify({ monday: ["morning"] }), rateMin: "15", rateMax: "20" }),
  );
  await saveNannyBioAction(null, formDataOf({ bio: "Ten years with under-fives across south London." }));
};

beforeEach(() => {
  resetJar();
  configureRateLimiter(
    createRateLimiter({ store: memoryRateLimitStore(), burstAlertMultiple: SECURITY.burstAlertMultiple }),
  );
  configureAuth(stubAuth());
  consents = memoryConsentStore();
  configureConsent(createConsent({ store: consents, cookieExpiryDays: SECURITY.retention.cookieExpiryDays }));
  events = memoryEventLogStore();
  configureEvents(createEvents({ store: events, log }));
  leads = memoryNannyLeadStore();
  configureNannyLeadStore(leads);
  accounts = memoryNannyAccountStore();
  configureNannyAccountStore(accounts);
});

describe("onboarding-nanny — signUpNannyAction from /apply (S-X-19; 04 §4.1 row 7)", () => {
  beforeEach(runFunnelToN4);

  it("creates the account NOT isolated, converts the lead, carries its profile, records AGR-02 and lands on S-N-01", async () => {
    const result = await signUpNannyAction(null, formDataOf(APPLY_SIGNUP));
    expect(result).toEqual({ ok: true, value: { destination: "/nanny/onboarding/add-child" } });

    const [row] = accounts.rows();
    expect(row).toMatchObject({
      firstName: "Amara",
      lastName: "Okafor",
      isolated: false,
      mobile: "+447700900123",
      district: "SW4",
      area: "Clapham",
      leadId: leads.rows()[0]?.id,
      profile: {
        yearsExperience: 6,
        hourlyRateMinPence: 1500,
        availability: { monday: ["morning"] },
        bio: "Ten years with under-fives across south London.",
      },
    });
    // the conversion itself is `create_nanny_account()`'s (ADR-152 (1)) — `int.rpc-0021` proves it; here the
    // action is seen handing the lead over, which is what it owns

    const recorded = consents.consents;
    expect(recorded.map((c) => c.purpose).sort()).toEqual(["privacy-policy", "professional-tos"]);
    expect(recorded.every((c) => c.party === "nanny" && c.agreementId === "AGR-02")).toBe(true);

    const names = events.rows.map((e) => e.name);
    expect(names).toContain("signup.completed");
    expect(names).toContain("nanny.applied");
    const applied = events.rows.find((e) => e.name === "nanny.applied");
    expect(applied?.props).toMatchObject({ path: "apply", areaDistrict: "SW4" });

    expect(jarOf().has(LEAD_COOKIE)).toBe(false);
  });

  it("without the lead cookie the /apply road refuses with `no-lead` and creates nothing", async () => {
    jarOf().delete(LEAD_COOKIE);
    const result = await signUpNannyAction(null, formDataOf(APPLY_SIGNUP));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({ reason: "no-lead" });
    expect(accounts.rows()).toHaveLength(0);
  });

  it("fails closed while the account store is unconfigured — no reason leaks, no half account is reported", async () => {
    NANNY_ACCOUNT_STORE_REGISTRY.set(UNCONFIGURED_ACCOUNTS);
    const result = await signUpNannyAction(null, formDataOf(APPLY_SIGNUP));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL");
    expect(JSON.stringify(result)).not.toContain("not-configured");
  });

  it("07 §8 row 2 — over the per-address signup limit the refusal is the same generic line", async () => {
    const generic = await (async () => {
      NANNY_ACCOUNT_STORE_REGISTRY.set(UNCONFIGURED_ACCOUNTS);
      const refused = await signUpNannyAction(null, formDataOf(APPLY_SIGNUP));
      configureNannyAccountStore(accounts);
      return refused.ok ? "" : refused.error.message;
    })();
    // the budget is per address (3 / day): the failed attempts above spent one, so two more then a refusal
    const perDay = SECURITY.rateLimits.signupPerEmail.perDay ?? 0;
    for (let i = 1; i < perDay; i += 1) {
      configureAuth(stubAuth());
      await runFunnelToN4();
      await signUpNannyAction(null, formDataOf(APPLY_SIGNUP));
    }
    configureAuth(stubAuth());
    await runFunnelToN4();
    const over = await signUpNannyAction(null, formDataOf(APPLY_SIGNUP));
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.error.code).toBe("INTERNAL");
    expect(over.error.message).toBe(generic);
  });
});

describe("onboarding-nanny — signUpNannyAction from an invite (S-X-07; 04 §4.2 b2; ADR-150)", () => {
  it("creates the account ISOLATED, clears the invite cookie and goes to the claim", async () => {
    jarOf().set(INVITE_COOKIE, "ABCD-2345");
    const result = await signUpNannyAction(null, formDataOf(INVITE_SIGNUP));
    expect(result).toEqual({ ok: true, value: { destination: "/invite/connect/ABCD-2345" } });
    expect(accounts.rows()[0]).toMatchObject({ firstName: "Bea", isolated: true });
    expect(accounts.rows()[0]?.leadId).toBeUndefined();
    expect(jarOf().has(INVITE_COOKIE)).toBe(false);
    expect(events.rows.map((e) => e.name)).not.toContain("nanny.applied");
    expect(events.rows.find((e) => e.name === "signup.completed")?.props).toMatchObject({
      role: "nanny",
      signupSource: "invite",
    });
  });

  it("a malformed invite cookie is ignored — the account is still isolated and lands on the hub", async () => {
    jarOf().set(INVITE_COOKIE, "../etc/passwd");
    const result = await signUpNannyAction(null, formDataOf(INVITE_SIGNUP));
    expect(result).toEqual({ ok: true, value: { destination: "/nanny" } });
    expect(accounts.rows()[0]?.isolated).toBe(true);
  });

  it("a bare S-X-07 with no invite at all is isolated too and lands on the hub (04 §6.3 'without invite, rare')", async () => {
    const result = await signUpNannyAction(null, formDataOf(INVITE_SIGNUP));
    expect(result).toEqual({ ok: true, value: { destination: "/nanny" } });
    expect(accounts.rows()[0]?.isolated).toBe(true);
    expect(events.rows.find((e) => e.name === "signup.completed")?.props).toMatchObject({ signupSource: "cold" });
  });

  it("validation refuses before any write, naming the field", async () => {
    const result = await signUpNannyAction(null, formDataOf({ ...INVITE_SIGNUP, email: "nope" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({ reason: "invalid-input", field: "email" });
    expect(accounts.rows()).toHaveLength(0);
  });
});
