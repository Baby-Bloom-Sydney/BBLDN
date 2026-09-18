// The cron shell L-009 `3c` gave an inside and `3g` gave a second pass: `/api/cron/audit-consent-expiry`
// (FATE `10.18` / `10.19` / `07.72` / `08.34`). It was declared in `config/crons.ts` from Phase 0 and answered
// `no-handler-registered` until `3c` — a 200 would have read as "the job ran", which is why `runCron` refuses
// instead. The shell is asserted on what it hands `runCron`; the Bearer rule is `run-cron.test.ts`'s.
//
// The cases that matter here are about the **join** (`3g`): the two passes both run, `handled` counts work
// completed on both sides, and `skipped` counts work outstanding on both — because a run summary that reported
// only the documents would show a clean night on the day a thousand people became due for a re-ask.
import { afterEach, describe, expect, it, vi } from "vitest";

const SECRET = "a-configured-cron-secret";
const PATH = "/api/cron/audit-consent-expiry";
const request = () =>
  new Request(`https://example.test${PATH}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });

const stubs = (
  sweep: {
    checked: number;
    carried: number;
    reAsk: number;
    unavailable: number;
  } = { checked: 0, carried: 0, reAsk: 0, unavailable: 0 },
) => {
  const auditExpiry = vi.fn(async (_now: string) => ({
    ok: true,
    value: { handled: 11, skipped: 0 },
  }));
  const sweepRenewals = vi.fn(async (_now: string) => ({
    ok: true,
    value: sweep,
  }));
  vi.doMock("@/modules/config/server", () => ({
    env: { environment: "test", public: {}, server: { CRON_SECRET: SECRET } },
  }));
  vi.doMock("@/modules/platform", async () => {
    const actual =
      await vi.importActual<typeof import("@/modules/platform")>(
        "@/modules/platform",
      );
    return {
      ...actual,
      consent: { ...actual.consent, auditExpiry, sweepRenewals },
    };
  });
  return { auditExpiry, sweepRenewals };
};

afterEach(() => {
  vi.doUnmock("@/modules/config/server");
  vi.doUnmock("@/modules/platform");
  vi.resetModules();
});

describe("/api/cron/audit-consent-expiry — the consent-document audit (10.19 / 07.72 / 08.34)", () => {
  it("★ has an inside now: it calls `consent.auditExpiry` with the run's instant and answers its counts", async () => {
    const { auditExpiry } = stubs();
    const { GET } = await import("@/app/api/cron/audit-consent-expiry/route");

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(auditExpiry).toHaveBeenCalledTimes(1);
    // One argument, and it is the instant `runCron` produced — the handler takes no clock of its own.
    expect(auditExpiry.mock.calls[0]).toHaveLength(1);
    expect(String(auditExpiry.mock.calls[0][0])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await response.json()).toMatchObject({
      data: { handled: 11, skipped: 0 },
    });
  });

  it("★ runs the per-user renewal sweep too, with the same instant (FATE 10.18)", async () => {
    const { sweepRenewals } = stubs();
    const { GET } = await import("@/app/api/cron/audit-consent-expiry/route");

    await GET(request());

    expect(sweepRenewals).toHaveBeenCalledTimes(1);
    expect(String(sweepRenewals.mock.calls[0][0])).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("★ counts a carry as work done and a re-ask as work outstanding", async () => {
    stubs({ checked: 9, carried: 4, reAsk: 5, unavailable: 0 });
    const { GET } = await import("@/app/api/cron/audit-consent-expiry/route");

    const response = await GET(request());

    // 11 documents audited + 4 carries written; 0 missing documents + 5 people nobody has re-asked.
    expect(await response.json()).toMatchObject({
      data: { handled: 15, skipped: 5 },
    });
  });

  it("★ a document with no version at all and a person owed a re-ask both land in `skipped`", async () => {
    stubs({ checked: 2, carried: 0, reAsk: 1, unavailable: 1 });
    const { GET } = await import("@/app/api/cron/audit-consent-expiry/route");

    const response = await GET(request());

    expect(await response.json()).toMatchObject({
      data: { handled: 11, skipped: 2 },
    });
  });

  it("still refuses without the Bearer secret — an inside does not soften the door", async () => {
    const { auditExpiry } = stubs();
    const { GET } = await import("@/app/api/cron/audit-consent-expiry/route");

    const response = await GET(new Request(`https://example.test${PATH}`));
    expect(response.status).not.toBe(200);
    expect(auditExpiry).not.toHaveBeenCalled();
  });
});
