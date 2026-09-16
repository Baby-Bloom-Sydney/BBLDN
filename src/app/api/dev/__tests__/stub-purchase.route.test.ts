// 07 §5.5 layer 3 — the stub route's three gates, each proved to refuse on its own.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { configurePayments, stubPayments } from "@/modules/payments";
import type { Email, Instant } from "@/modules/shared-types";

const SECRET = "placeholder-stub-event-secret";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-01-01T00:00:00.000Z" as Instant;

const post = (authorization?: string) =>
  new Request("https://example.test/api/dev/stub-purchase", {
    method: "POST",
    body: JSON.stringify({ kind: "ignored", eventId: "e1", providerType: "x" }),
    headers: authorization === undefined ? {} : { authorization },
  });

const signedInAs = (role: "parent" | "admin", mfaVerified: boolean) =>
  configureAuth(
    stubAuth({
      users: [
        {
          id: ADMIN_ID,
          email: "a@example.test" as Email,
          password: "pw",
          role,
          mfaVerified,
        },
      ],
      signedInUserId: ADMIN_ID,
    }),
  );

beforeEach(() => {
  // No provider: this suite is about the route's three gates, not about what the spine then does. A caller who
  // passes all three reaches `handleWebhook` and gets its error — which is exactly the assertion below.
  configurePayments(stubPayments({ now: NOW }));
});

describe("gate 2 — the admin role, checked before the secret", () => {
  it("refuses an anonymous caller even with the right secret", async () => {
    configureAuth(stubAuth());
    const { POST } = await import("../stub-purchase/route");

    expect((await POST(post(`Bearer ${SECRET}`))).status).toBe(401);
  });

  it("refuses a signed-in parent holding the right secret", async () => {
    signedInAs("parent", true);
    const { POST } = await import("../stub-purchase/route");

    expect([401, 403]).toContain((await POST(post(`Bearer ${SECRET}`))).status);
  });

  it("refuses an admin whose session is only aal1", async () => {
    signedInAs("admin", false);
    const { POST } = await import("../stub-purchase/route");

    expect([401, 403]).toContain((await POST(post(`Bearer ${SECRET}`))).status);
  });
});

describe("gate 3 — the shared secret, constant-time and fail-closed", () => {
  beforeEach(() => {
    signedInAs("admin", true);
  });

  it("refuses an admin presenting no bearer", async () => {
    const { POST } = await import("../stub-purchase/route");

    expect((await POST(post())).status).toBe(401);
  });

  it("refuses an admin presenting a wrong bearer", async () => {
    const { POST } = await import("../stub-purchase/route");

    expect((await POST(post("Bearer wrong"))).status).toBe(401);
  });

  it("lets an aal2 admin with the right secret reach the spine", async () => {
    const { POST } = await import("../stub-purchase/route");

    const response = await POST(post(`Bearer ${SECRET}`));

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});

describe("gate 1 — the route does not exist in production (ADR-108)", () => {
  it("404s before reading the session or the body", async () => {
    vi.resetModules();
    vi.doMock("@/modules/config/server", () => ({
      env: {
        environment: "production",
        public: {},
        server: { STUB_EVENT_SECRET: SECRET },
      },
    }));
    const { POST } = await import("../stub-purchase/route");

    expect((await POST(post(`Bearer ${SECRET}`))).status).toBe(404);

    vi.doUnmock("@/modules/config/server");
    vi.resetModules();
  });
});
