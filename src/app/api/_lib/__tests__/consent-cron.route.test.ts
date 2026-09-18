// The cron shell L-009 `3c` gives an inside: `/api/cron/audit-consent-expiry` (FATE `10.19` / `07.72` / `08.34`).
// It was declared in `config/crons.ts` from Phase 0 and has answered `no-handler-registered` ever since — a 200
// would have read as "the job ran", which is why `runCron` refuses instead. The shell is asserted on what it
// hands `runCron`; the Bearer rule is `run-cron.test.ts`'s.
import { afterEach, describe, expect, it, vi } from "vitest";

const SECRET = "a-configured-cron-secret";
const PATH = "/api/cron/audit-consent-expiry";
const request = () =>
  new Request(`https://example.test${PATH}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });

const stubs = () => {
  const auditExpiry = vi.fn(async (_now: string) => ({
    ok: true,
    value: { handled: 11, skipped: 0 },
  }));
  vi.doMock("@/modules/config/server", () => ({
    env: { environment: "test", public: {}, server: { CRON_SECRET: SECRET } },
  }));
  vi.doMock("@/modules/platform", async () => {
    const actual =
      await vi.importActual<typeof import("@/modules/platform")>(
        "@/modules/platform",
      );
    return { ...actual, consent: { ...actual.consent, auditExpiry } };
  });
  return { auditExpiry };
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

  it("still refuses without the Bearer secret — an inside does not soften the door", async () => {
    const { auditExpiry } = stubs();
    const { GET } = await import("@/app/api/cron/audit-consent-expiry/route");

    const response = await GET(new Request(`https://example.test${PATH}`));
    expect(response.status).not.toBe(200);
    expect(auditExpiry).not.toHaveBeenCalled();
  });
});
