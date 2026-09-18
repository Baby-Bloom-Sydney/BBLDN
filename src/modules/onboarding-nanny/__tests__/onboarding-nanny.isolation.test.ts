// S-N-19 — apply-from-portal (`02.07`; ADR-147 / ADR-152 (3)): a signed-in nanny's application writes a `portal`
// lead, lifts her isolation exactly once, emits `nanny.applied` + `nanny.isolation-lifted`, and sends her on to
// the verification wizard (04 §4.2 b4). A visitor, a parent, and a nanny who is not isolated are each refused
// or answered without a second lift. RED first.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
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
import type { Email } from "@/modules/shared-types";
import { cookieJarModule, resetJar } from "./cookie-jar";
import { configureNannyLeadStore } from "../lib/configure-nanny-lead-store";
import { memoryNannyLeadStore } from "../lib/memory-nanny-lead-store";
import { configureNannyAccountStore } from "../lib/configure-nanny-account-store";
import { memoryNannyAccountStore } from "../lib/memory-nanny-account-store";
import { applyFromPortalAction } from "../actions/apply-from-portal-action";

vi.mock("next/headers", () => cookieJarModule());

const formDataOf = (
  fields: Record<string, string | ReadonlyArray<string>>,
): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") data.set(key, value);
    else for (const item of value) data.append(key, item);
  }
  return data;
};

const NANNY = "22222222-2222-4222-8222-222222222222";
const PARENT = "11111111-1111-4111-8111-111111111111";
const users = [
  {
    id: NANNY,
    email: "bea@example.test" as Email,
    password: "x".repeat(12),
    role: "nanny" as const,
  },
  {
    id: PARENT,
    email: "ada@example.test" as Email,
    password: "x".repeat(12),
    role: "parent" as const,
  },
];

const PORTAL = {
  district: "SW4",
  area: "Clapham",
  rtwStatus: "settled",
  hasEnhancedDbs: "yes",
  yearsExperience: "4",
  ageGroups: ["toddlers"],
  roleTypes: ["part-time"],
  availability: JSON.stringify({ tuesday: ["afternoon"] }),
  rateMin: "16",
  rateMax: "22",
  bio: "Four years with toddlers in south London, references on request.",
};

let events: ReturnType<typeof memoryEventLogStore>;
let leads: ReturnType<typeof memoryNannyLeadStore>;
let accounts: ReturnType<typeof memoryNannyAccountStore>;

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
  accounts = memoryNannyAccountStore({
    emails: { [NANNY]: "bea@example.test" as Email },
  });
  configureNannyAccountStore(accounts);
});

const signedInAs = (id: string) =>
  configureAuth(stubAuth({ users, signedInUserId: id }));

describe("onboarding-nanny — applyFromPortalAction (S-N-19)", () => {
  beforeEach(async () => {
    signedInAs(NANNY);
    await accounts.create({
      userId: NANNY as never,
      firstName: "Bea",
      lastName: "Lin",
      isolated: true,
    });
  });

  it("writes the portal lead, lifts the flag once, emits both events and sends her to the wizard", async () => {
    const result = await applyFromPortalAction(null, formDataOf(PORTAL));
    expect(result).toEqual({
      ok: true,
      value: { destination: "/nanny/onboarding-verification" },
    });

    expect(leads.rows()).toHaveLength(1);
    expect(leads.rows()[0]).toMatchObject({
      email: "bea@example.test",
      firstName: "Bea",
      source: "portal",
      district: "SW4",
      rtwStatus: "settled",
      roleTypes: ["part-time"],
      rateBand: { minPence: 1600, maxPence: 2200 }, // config-literal-ok: a fixture's own rate, not a PRICES value
      bio: PORTAL.bio,
    });
    expect(accounts.rows()[0]?.isolated).toBe(false);
    // and the profile she just gave is on her account row, not only on the lead
    expect(accounts.rows()[0]?.profile).toMatchObject({
      yearsExperience: 4,
      hourlyRateMinPence: 1600, // config-literal-ok: a fixture's own rate, not a PRICES value
      bio: PORTAL.bio,
    });

    const names = events.rows.map((e) => e.name);
    expect(names).toContain("nanny.applied");
    expect(names).toContain("nanny.isolation-lifted");
    expect(
      events.rows.find((e) => e.name === "nanny.applied")?.props,
    ).toMatchObject({ path: "apply-from-portal" });
  });

  it("applying again does not lift twice — one isolation-lifted event ever", async () => {
    await applyFromPortalAction(null, formDataOf(PORTAL));
    const again = await applyFromPortalAction(null, formDataOf(PORTAL));
    expect(again.ok).toBe(true);
    expect(
      events.rows.filter((e) => e.name === "nanny.isolation-lifted"),
    ).toHaveLength(1);
  });

  it("refuses a field it cannot accept, naming it, and lifts nothing", async () => {
    const result = await applyFromPortalAction(
      null,
      formDataOf({ ...PORTAL, rtwStatus: "australian" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({
      reason: "invalid-input",
      field: "rtwStatus",
    });
    expect(accounts.rows()[0]?.isolated).toBe(true);
  });
});

describe("onboarding-nanny — applyFromPortalAction refuses the wrong caller (01 §4d defence in depth)", () => {
  it("a visitor is UNAUTHENTICATED", async () => {
    configureAuth(stubAuth({ users }));
    const result = await applyFromPortalAction(null, formDataOf(PORTAL));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("a parent is FORBIDDEN", async () => {
    signedInAs(PARENT);
    const result = await applyFromPortalAction(null, formDataOf(PORTAL));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });
});
