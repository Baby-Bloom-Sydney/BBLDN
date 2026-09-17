// S-X-15 → S-X-18 — the three funnel actions: the application captures the lead and mints the lead cookie
// (ADR-150), an address that already has an account is sent to sign in (04 §4.1 row 5), the two later steps
// patch the lead the cookie names and refuse without it, and 07 §8 row 2's limiter refuses with the one generic
// line. RED first (ADR-123 rule 1).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECURITY } from "@/modules/config";
import {
  configureEvents,
  configureRateLimiter,
  createEvents,
  createRateLimiter,
  log,
  memoryEventLogStore,
  memoryRateLimitStore,
} from "@/modules/platform";
import { cookieJarModule, jarOf, resetJar } from "./cookie-jar";
import { configureNannyLeadStore } from "../lib/configure-nanny-lead-store";
import { memoryNannyLeadStore } from "../lib/memory-nanny-lead-store";
import { NANNY_LEAD_STORE_REGISTRY } from "../lib/nanny-lead-store-registry";
import { saveNannyApplicationAction } from "../actions/save-nanny-application-action";
import { saveNannyPortfolioAction } from "../actions/save-nanny-portfolio-action";
import { saveNannyBioAction } from "../actions/save-nanny-bio-action";

vi.mock("next/headers", () => cookieJarModule());

const formDataOf = (fields: Record<string, string | ReadonlyArray<string>>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") data.set(key, value);
    else for (const item of value) data.append(key, item);
  }
  return data;
};

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

const LEAD_COOKIE = SECURITY.carriedTokens.nannyLead.name;
const UNCONFIGURED = NANNY_LEAD_STORE_REGISTRY.get();

let leads: ReturnType<typeof memoryNannyLeadStore>;
let events: ReturnType<typeof memoryEventLogStore>;

beforeEach(() => {
  resetJar();
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
  );
  events = memoryEventLogStore();
  configureEvents(createEvents({ store: events, log }));
  leads = memoryNannyLeadStore();
  configureNannyLeadStore(leads);
});

describe("onboarding-nanny — saveNannyApplicationAction (S-X-15 page 8: the lead is written)", () => {
  it("captures the lead, mints the lead cookie, emits lead.created and answers the interstitial", async () => {
    const result = await saveNannyApplicationAction(null, formDataOf(APPLICATION));
    expect(result).toEqual({ ok: true, value: { next: "interstitial" } });
    expect(leads.rows()).toHaveLength(1);
    expect(leads.rows()[0]).toMatchObject({
      email: "amara@example.test",
      district: "SW4",
      rtwStatus: "citizen",
      hasEnhancedDbs: true,
      yearsExperience: 6,
      source: "apply",
      status: "applied",
    });
    expect(jarOf().get(LEAD_COOKIE)).toBe(leads.rows()[0]?.id);
    expect(events.rows.map((row) => row.name)).toContain("lead.created");
  });

  it("an address that already has an account is sent to sign in, with no lead and no cookie (04 §4.1 row 5)", async () => {
    leads = memoryNannyLeadStore({ accounts: ["amara@example.test"] });
    configureNannyLeadStore(leads);
    const result = await saveNannyApplicationAction(null, formDataOf(APPLICATION));
    expect(result).toEqual({ ok: true, value: { next: "sign-in" } });
    expect(leads.rows()).toHaveLength(0);
    expect(jarOf().has(LEAD_COOKIE)).toBe(false);
  });

  it("a second submission under the same address overwrites the unconverted lead in place (02 §4.7)", async () => {
    await saveNannyApplicationAction(null, formDataOf(APPLICATION));
    await saveNannyApplicationAction(null, formDataOf({ ...APPLICATION, yearsExperience: "9" }));
    expect(leads.rows()).toHaveLength(1);
    expect(leads.rows()[0]?.yearsExperience).toBe(9);
  });

  it("refuses an invalid field with a VALIDATION naming it and writes nothing", async () => {
    const result = await saveNannyApplicationAction(null, formDataOf({ ...APPLICATION, mobile: "no" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
    expect(result.error.details).toEqual({ reason: "invalid-input", field: "mobile" });
    expect(leads.rows()).toHaveLength(0);
  });

  it("fails closed while the lead store is unconfigured, and keeps the reason server-side (01 §4a)", async () => {
    NANNY_LEAD_STORE_REGISTRY.set(UNCONFIGURED);
    const result = await saveNannyApplicationAction(null, formDataOf(APPLICATION));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL");
    expect(JSON.stringify(result)).not.toContain("not-configured");
  });

  it("07 §8 row 2 — over the funnelStep limit the refusal is the same generic line, and no lead is written", async () => {
    const generic = await (async () => {
      NANNY_LEAD_STORE_REGISTRY.set(UNCONFIGURED);
      const refused = await saveNannyApplicationAction(null, formDataOf(APPLICATION));
      configureNannyLeadStore(leads);
      return refused.ok ? "" : refused.error.message;
    })();
    const limit = SECURITY.rateLimits.funnelStep.perMinute ?? 0;
    for (let i = 0; i < limit; i += 1)
      await saveNannyApplicationAction(null, formDataOf({ ...APPLICATION, email: `n${i}@example.test` }));
    const over = await saveNannyApplicationAction(null, formDataOf({ ...APPLICATION, email: "over@example.test" }));
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.error.code).toBe("INTERNAL");
    expect(over.error.message).toBe(generic);
    expect(leads.rows().some((row) => row.email === "over@example.test")).toBe(false);
  });
});

describe("onboarding-nanny — saveNannyPortfolioAction · saveNannyBioAction (S-X-17 · S-X-18 patch the cookie's lead)", () => {
  const PORTFOLIO = {
    roleTypes: ["full-time"],
    availability: JSON.stringify({ monday: ["morning"] }),
    rateMin: "15",
    rateMax: "20",
  };

  beforeEach(async () => {
    await saveNannyApplicationAction(null, formDataOf(APPLICATION));
  });

  it("patches the lead the cookie names", async () => {
    expect(await saveNannyPortfolioAction(null, formDataOf(PORTFOLIO))).toEqual({ ok: true, value: undefined });
    expect(await saveNannyBioAction(null, formDataOf({ bio: "Ten years with under-fives across south London." }))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(leads.rows()[0]).toMatchObject({
      roleTypes: ["full-time"],
      availability: { monday: ["morning"] },
      rateBand: { minPence: 1500, maxPence: 2000 },
      bio: "Ten years with under-fives across south London.",
    });
  });

  it("refuses with `no-lead` when the cookie is gone — the funnel restarts at N1", async () => {
    jarOf().delete(LEAD_COOKIE);
    const result = await saveNannyPortfolioAction(null, formDataOf(PORTFOLIO));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({ reason: "no-lead" });
    expect(leads.rows()[0]?.roleTypes).toEqual([]);
  });

  it("refuses with `no-lead` when the cookie names a lead the store does not hold", async () => {
    jarOf().set(LEAD_COOKIE, "00000000-0000-4000-8000-000000000000");
    const result = await saveNannyBioAction(null, formDataOf({ bio: "Ten years with under-fives across south London." }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({ reason: "no-lead" });
  });

  it("a malformed cookie value is a `no-lead`, never a lookup", async () => {
    jarOf().set(LEAD_COOKIE, "not-a-uuid");
    const result = await saveNannyPortfolioAction(null, formDataOf(PORTFOLIO));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({ reason: "no-lead" });
  });
});
