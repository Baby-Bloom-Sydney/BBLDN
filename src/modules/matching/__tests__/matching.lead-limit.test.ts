// 07 §8 row 2 on `saveParentLead` (REVIEW-2 M-5; ADR-140 (3)). The wizard's progressive save is an anonymous
// `"use server"` export that writes a `parent_leads` row of a stranger's answers, and it shipped with no ceiling
// of any kind — row 2 names 10 a minute for exactly this surface. It fails **closed** on a limiter outage: the
// allow-list of ADR-134 carries `publicRead` only, and this is a write.
//
// The limiter runs over the memory store here; what is under test is the action's behaviour once the policy is
// exceeded, not the store.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECURITY } from "@/modules/config";
import { configureMatching, saveParentLeadAction } from "@/modules/matching";
import {
  configureRateLimiter,
  createRateLimiter,
  memoryRateLimitStore,
  ok,
} from "@/modules/platform";

const LEAD_ID = "6f1c0e2a-2f1a-4f3b-9c2d-8a1b2c3d4e5f";
const PER_MINUTE = SECURITY.rateLimits.funnelStep.perMinute ?? 0;

const payload = () => ({
  leadId: LEAD_ID,
  answers: {},
  source: null,
  completed: false,
});

const saved = { count: 0 };

beforeEach(() => {
  saved.count = 0;
  configureMatching({
    saveLead: async () => {
      saved.count += 1;
      return ok(undefined);
    },
  } as never);
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
      failOpenOnLimiterOutage: SECURITY.failOpenOnLimiterOutage,
    }),
    "shared",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveParentLeadAction — 07 §8 row 2 (M-5)", () => {
  it("saves inside the limit", async () => {
    const result = await saveParentLeadAction(payload());

    expect(result.ok).toBe(true);
    expect(saved.count).toBe(1);
  });

  it("refuses a burst with RATE_LIMITED and writes nothing more", async () => {
    expect(PER_MINUTE).toBeGreaterThan(0);
    for (let i = 0; i < PER_MINUTE; i += 1)
      expect((await saveParentLeadAction(payload())).ok).toBe(true);

    const refused = await saveParentLeadAction(payload());

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.code).toBe("RATE_LIMITED");
    expect(saved.count).toBe(PER_MINUTE);
  });

  it("fails CLOSED when the limiter store cannot answer — a write is never on the allow-list", async () => {
    configureRateLimiter(
      createRateLimiter({
        store: {
          increment: async () => ({
            ok: false,
            error: { code: "INTERNAL", message: "db down" },
          }),
        },
        burstAlertMultiple: SECURITY.burstAlertMultiple,
        failOpenOnLimiterOutage: SECURITY.failOpenOnLimiterOutage,
      }),
      "shared",
    );

    const refused = await saveParentLeadAction(payload());

    expect(refused.ok).toBe(false);
    expect(saved.count).toBe(0);
  });

  it("spends nothing on a malformed payload — validation comes first", async () => {
    for (let i = 0; i <= PER_MINUTE; i += 1)
      await saveParentLeadAction({ ...payload(), leadId: "not-a-uuid" });

    expect((await saveParentLeadAction(payload())).ok).toBe(true);
  });
});

// ── ADR-146 (2) — the captured contact crosses the same boundary as the answers ──────────────────────────────
//
// `parent_leads.email` (`0020`) is written by this one action, because `saveLead` is the only writer of the row
// (02 §4.7) and `form_data` travels with it. It is optional — a wizard-only lead has none — and it is validated
// at the boundary like everything else here (01 §4a): it becomes the value ADR-145 (2)'s control compares
// against, so a caller must not be able to put an arbitrary string in it.
describe("saveParentLeadAction — the captured email (ADR-146 (2))", () => {
  const captured = { value: "not-called" as unknown };

  beforeEach(() => {
    captured.value = "not-called";
    configureMatching({
      saveLead: async (input: { readonly email?: string | null }) => {
        captured.value = input.email;
        return ok(undefined);
      },
    } as never);
  });

  it("forwards a captured email to the store", async () => {
    const result = await saveParentLeadAction({
      ...payload(),
      email: "Ada@Example.test",
    });

    expect(result.ok).toBe(true);
    expect(captured.value).toBe("Ada@Example.test");
  });

  it("omits it when the wizard captured none", async () => {
    await saveParentLeadAction(payload());

    expect(captured.value).toBeUndefined();
  });

  it("refuses a value that is not an address rather than storing it", async () => {
    const refused = await saveParentLeadAction({
      ...payload(),
      email: "not-an-address",
    });

    expect(refused.ok).toBe(false);
    expect(captured.value).toBe("not-called");
  });
});
