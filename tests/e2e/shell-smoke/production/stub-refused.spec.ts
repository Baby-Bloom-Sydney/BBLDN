// E1 assertion 6 — **the stub payment provider refuses in a production-resolved environment, and never pretends
// to charge** (07 §5.5; ADR-108; AC-X-35). Three layers, each sufficient alone; this file asserts the two that
// are observable over HTTP, against a second server booted with `VERCEL_ENV=production`:
//
//   layer 1 — excluded from the production build: `npm run check:bundle-secrets` (AC-X-36) already scans every
//             emitted chunk for `stub-stripe`, so it is cited here, not re-implemented.
//   layer 2 — the env guard at boot: `scripts/ci/boot-guard.sh` case 6 starts a production-valid environment
//             whose *only* fault is `PURCHASE_PROVIDER=stub-stripe` and requires a non-zero exit. (The existing
//             `check:prod-guard` makes the same claim but does not prove it — see docs/build-progress.md.)
//   layer 3 — the route: in a production-resolved environment `/api/dev/stub-purchase` 404s as if it did not
//             exist, **before** the admin check and before the shared secret. That is this file.
import { expect, test } from "@playwright/test";
import { STATUS } from "../envelope";
import { requiredSecret } from "../secrets";

test("the server under test really is up — /api/health answers 200", async ({
  request,
}) => {
  const response = await request.get("/api/health");

  // Without this, every 404 below would also be produced by a server that never started.
  expect(response.status()).toBe(STATUS.ok);
});

test("/api/dev/stub-purchase 404s in a production-resolved environment", async ({
  request,
}) => {
  const response = await request.post("/api/dev/stub-purchase", { data: {} });

  expect(response.status()).toBe(STATUS.notFound);
});

test("the 404 comes before the secret — a held stub secret opens nothing", async ({
  request,
}) => {
  const response = await request.post("/api/dev/stub-purchase", {
    headers: { authorization: "Bearer placeholder-stub-event-secret" },
    data: { id: "evt_stub", kind: "paid" },
  });

  expect(response.status()).toBe(STATUS.notFound);
  expect(await response.text()).toBe("");
});

// "Never pretends to charge": with no provider registered (`PURCHASE_PROVIDER=stripe-uk` and no `stripe-uk`
// inside — N-2 / ADR-022), every completion path fails closed rather than reporting a payment.
test("the completion spine answers no 2xx without a verified event", async ({
  request,
}) => {
  const response = await request.post("/api/webhooks/stripe", {
    headers: { "stripe-signature": "t=1,v1=forged" },
    data: { id: "evt_forged", type: "checkout.session.completed" },
  });

  expect(response.ok()).toBe(false);
});

test("the gate and the cron shells hold in production too", async ({
  request,
}) => {
  const gated = await request.get("/admin", { maxRedirects: 0 });
  expect(gated.status()).toBe(STATUS.redirect);

  const unauthorisedCron = await request.get("/api/cron/expire-trials");
  expect(unauthorisedCron.status()).toBe(STATUS.unauthenticated);

  const authorisedCron = await request.get("/api/cron/expire-trials", {
    headers: { authorization: `Bearer ${requiredSecret("CRON_SECRET")}` },
  });
  expect(authorisedCron.status()).toBe(STATUS.internal);
});
