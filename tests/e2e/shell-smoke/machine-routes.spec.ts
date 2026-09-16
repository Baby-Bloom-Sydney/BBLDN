// E1 assertions 4 (webhook + agent) and 5 (the admin snapshot route), on the assembled server.
//
// 01 §4e: "Route handlers authenticate explicitly (Bearer `CRON_SECRET`, Stripe signature, `ADMIN_API_TOKEN`,
// or the session) and **fail closed** when the secret is unset." 07 §5.4 row 1: the admin role is re-checked in
// every admin surface, not only in middleware — `/api/admin/pipeline-snapshots` is the Sydney route that had no
// check at all and read the whole funnel with a service-role client.
import { expect, test } from "@playwright/test";
import { errorEnvelopeOf, STATUS } from "./envelope";
import { requiredSecret } from "./secrets";

test.describe("/api/webhooks/stripe", () => {
  test("refuses an unsigned request before anything is parsed", async ({
    request,
  }) => {
    const response = await request.post("/api/webhooks/stripe", {
      data: { any: "payload" },
    });
    const envelope = await errorEnvelopeOf(response);

    // VALIDATION is 422 in the 01 §4a table (the route's own comment says 400 — the table is the contract).
    expect(response.status()).toBe(STATUS.validation);
    expect(envelope.error.code).toBe("VALIDATION");
    expect(envelope.error.details?.reason).toBe("E_EVENT_UNVERIFIED");
  });

  test("refuses a blank signature header", async ({ request }) => {
    const response = await request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": "" },
      data: { any: "payload" },
    });

    expect(response.status()).toBe(STATUS.validation);
  });

  // ★ **This test does NOT yet prove signature verification, and must be tightened when it can.** (E1
  // security-reviewer MEDIUM 1; tracked in `docs/build-progress.md` Known bugs, E1 entry, and in the L-005
  // PROGRESS E1 entry.) `payments.handleWebhook` is unconfigured in this build — its registry refuses **every**
  // call, verified or not — so the request never reaches the signature check, and this assertion would pass
  // identically if that check did not exist. It is written as the weakest claim that is true today and must
  // still be true forever: nothing forged is ever answered 2xx.
  //
  // **Whoever lands the payments inside owns the upgrade:** in the same PR, change this to assert
  // `422 / VALIDATION / E_EVENT_UNVERIFIED` (03 §5.4) for a syntactically plausible but forged signature.
  // Until then Tier A has no positive proof of the one control standing between a forged webhook and a family's
  // access being opened (07 §10.1; 03 §5.4.3).
  test("never answers 2xx to a forged signature", async ({ request }) => {
    const response = await request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": "t=1,v1=forged" },
      data: { id: "evt_forged", type: "checkout.session.completed" },
    });

    expect(response.ok()).toBe(false);
    await errorEnvelopeOf(response);
  });
});

test.describe("/api/agent", () => {
  for (const [label, headers] of [
    ["no authorization header", {}],
    ["a blank bearer", { authorization: "Bearer " }],
    ["a wrong bearer", { authorization: "Bearer not-the-admin-token" }],
  ] as const) {
    test(`refuses ${label}`, async ({ request }) => {
      const response = await request.post("/api/agent", { headers, data: {} });
      const envelope = await errorEnvelopeOf(response);

      expect(response.status()).toBe(STATUS.unauthenticated);
      expect(envelope.error.code).toBe("UNAUTHENTICATED");
    });
  }

  test("answers no-handler-registered to an authorised caller", async ({
    request,
  }) => {
    const response = await request.post("/api/agent", {
      headers: { authorization: `Bearer ${requiredSecret("ADMIN_API_TOKEN")}` },
      data: {},
    });
    const envelope = await errorEnvelopeOf(response);

    expect(response.status()).toBe(STATUS.internal);
    expect(envelope.error.code).toBe("INTERNAL");
  });

  // 07 §5.4 row 4: the agent token is scoped to this route and is never accepted on `/admin`.
  test("the agent token is not accepted on an admin surface", async ({
    request,
  }) => {
    const response = await request.get("/api/admin/pipeline-snapshots", {
      headers: { authorization: `Bearer ${requiredSecret("ADMIN_API_TOKEN")}` },
    });

    expect(response.status()).toBe(STATUS.unauthenticated);
  });
});

test.describe("/api/admin/pipeline-snapshots", () => {
  // `errorEnvelopeOf` is what rules out a leak here: it requires an `error` object, so a response carrying a
  // `data` payload could never reach the status assertion (typescript-reviewer MEDIUM 1 — a bare
  // `expect(body.data).toBeUndefined()` would have passed if the funnel leaked under any other key).
  test("is gated — an unauthenticated read is refused, not served", async ({
    request,
  }) => {
    const response = await request.get("/api/admin/pipeline-snapshots");
    const envelope = await errorEnvelopeOf(response);

    expect(response.status()).toBe(STATUS.unauthenticated);
    expect(envelope.error.code).toBe("UNAUTHENTICATED");
  });

  test("the cron bearer does not open it either", async ({ request }) => {
    const response = await request.get("/api/admin/pipeline-snapshots", {
      headers: { authorization: `Bearer ${requiredSecret("CRON_SECRET")}` },
    });

    expect(response.status()).toBe(STATUS.unauthenticated);
  });
});
