// REVIEW-3 H-2 — **a lead store that is down looks exactly like a nanny who never applied.**
//
// `read-lead-cookie.ts` folded `!lead.ok` (the store refused) into the same `NO_LEAD` as `lead.value === null`
// (no such lead), and logged neither. Its header argues the *caller-facing* half correctly and deliberately:
// "every miss is the one `no-lead` refusal … and nothing about which miss it was reaches the form." That rule
// is right and this change does not touch it — the sentence she sees is unchanged. What the header never
// argued, and what was missing, is the **operator-facing** half.
//
// The cost. `readLeadCookie` is the gate on all three steps that come after the application is captured —
// `saveNannyPortfolioAction` (N3), `saveNannyBioAction` (N4) and `signUpNannyAction` (S-X-18, where the lead
// becomes the account and converts). A transient `nanny_leads` outage therefore tells every nanny in flight
// "Let's start your application again — we couldn't find the one you began", drops her back to N1, and
// **orphans the lead row she had already filled in** — while the log is silent, so the only trace of an
// outage at the top of the entire nanny acquisition funnel is a drop-off curve indistinguishable from people
// changing their minds. That is REVIEW-2's H-8 shape ("a smaller number that looks real"), applied to leads.
//
// The module already knows how to draw this distinction — `consume-lead-capture-limit.ts` and its siblings
// separate "refused" from "the limiter could not answer" and alert on the second. This makes the lead read
// behave the same way.
//
// RED first: before the fix the refusing store produced the identical result with an empty log.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECURITY } from "@/modules/config";
import {
  configureEvents,
  configureLog,
  configureRateLimiter,
  createEvents,
  createRateLimiter,
  log,
  memoryEventLogStore,
  memoryRateLimitStore,
} from "@/modules/platform";
import type { LeadId } from "@/modules/shared-types";
import { cookieJarModule, jarOf, resetJar } from "./cookie-jar";
import { configureNannyLeadStore } from "../lib/configure-nanny-lead-store";
import { memoryNannyLeadStore } from "../lib/memory-nanny-lead-store";
import { saveNannyBioAction } from "../actions/save-nanny-bio-action";

vi.mock("next/headers", () => cookieJarModule());

const LEAD_COOKIE = SECURITY.carriedTokens.nannyLead.name;
const LEAD = "3f2504e0-4f89-41d3-9a0c-0305e82c3301" as LeadId;

const bioForm = (): FormData => {
  const data = new FormData();
  data.set(
    "bio",
    "I have looked after small children in Clapham for six years.",
  );
  return data;
};

beforeEach(() => {
  resetJar();
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
  );
  configureEvents(createEvents({ store: memoryEventLogStore(), log }));
  configureNannyLeadStore(memoryNannyLeadStore());
});

/** The captured JSON log lines of one call (the `payments.screens` pattern). */
async function linesOf(run: () => Promise<unknown>) {
  const lines: Array<Record<string, unknown>> = [];
  const out = vi.spyOn(console, "error").mockImplementation((line) => {
    lines.push(JSON.parse(String(line)) as Record<string, unknown>);
    return undefined;
  });
  configureLog({ format: "json", minLevel: "info" });
  try {
    await run();
    return lines;
  } finally {
    out.mockRestore();
  }
}

/** A store whose `get` refuses — an outage, not an absence. */
const refusingStore = () => {
  const base = memoryNannyLeadStore();
  return {
    ...base,
    get: async () => ({
      ok: false as const,
      error: {
        code: "INTERNAL" as const,
        message: "nanny_leads is unavailable",
      },
    }),
  };
};

describe("the lead read tells an outage from an absence (REVIEW-3 H-2)", () => {
  it("a refused lead read alerts, so an outage at the top of the funnel is visible to someone", async () => {
    configureNannyLeadStore(
      refusingStore() as ReturnType<typeof memoryNannyLeadStore>,
    );
    jarOf().set(LEAD_COOKIE, LEAD as string);
    const lines = await linesOf(() => saveNannyBioAction(null, bioForm()));
    expect(lines.map((row) => row.alert)).toContain("ALERT_PROVIDER_DOWN");
  });

  it("a lead that simply is not there stays silent — a nanny with a stale cookie is not an incident", async () => {
    jarOf().set(LEAD_COOKIE, LEAD as string);
    const lines = await linesOf(() => saveNannyBioAction(null, bioForm()));
    expect(lines).toEqual([]);
  });

  it("and the nanny is told the same thing either way — ADR-151's rule is untouched", async () => {
    jarOf().set(LEAD_COOKIE, LEAD as string);
    const absent = await saveNannyBioAction(null, bioForm());
    configureNannyLeadStore(
      refusingStore() as ReturnType<typeof memoryNannyLeadStore>,
    );
    jarOf().set(LEAD_COOKIE, LEAD as string);
    const refused = await saveNannyBioAction(null, bioForm());
    expect(refused).toEqual(absent);
  });
});
