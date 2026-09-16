// E1 assertion 1 — **the app boots**. `next build` produced `.next/`, `next start` serves it with a valid
// environment (`scripts/ci/shell-smoke-server.sh`), and the uptime probe's endpoint answers (06 §7.3 row 12).
// If this file goes red the assembled application does not run, whatever the unit suites say.
//
// Assertion 2 (the boot fails closed on a bad env) is not here: it is a process-exit assertion, and a Playwright
// worker cannot observe a server that never came up. It lives in `scripts/ci/boot-guard.sh` (`npm run
// check:boot-guard`), which judges exit codes directly — six cases, including the two positive controls.
import { expect, test } from "@playwright/test";
import { errorEnvelopeOf, isRequestId, STATUS } from "./envelope";

test("GET /api/health answers 200 with JSON", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(STATUS.ok);
  expect(response.headers()["content-type"]).toContain("application/json");
});

// 06 §7.3 (last paragraph): "`/api/health` is a route handler (01 §4e) returning `{ data: { sha, env, db: "ok" } }`
// after one trivial Supabase read"; 06 §4.5's promote step verifies "`/api/health` 200 **with the new sha**", and
// HANDOFF §11 G2 says the same. 01 §4c makes `requestId` part of every envelope.
//
// E1 pinned this as a `test.fail()` against F-c's bare `{ status: "ok" }`; ADR-121 ruled the document right and
// P1-FIX fixed the route, so it is a real expectation now. **What this server can and cannot show:** the smoke
// boots with Supabase deliberately unreachable (`scripts/ci/lib/smoke-env.sh` — 01 §4d step 2 wants a session
// the app cannot read *refused*), so the one real read `db` performs cannot succeed here. The honest, fail-closed
// answer is therefore `db: "failed"` — and that is what is asserted, because a probe that said `"ok"` with no
// database behind it is exactly the lie the field exists to prevent. The `db: "ok"` half of the contract is
// pinned by `src/app/api/health/route.test.ts` against a reachable (in-memory) port.
//
// The shape is spelled out inline here rather than read through `envelope.ts`: `SuccessEnvelope<T>`'s `T` is
// whatever the route returns, and what 06 §7.3 says that `T` is — `{ sha, env, db }` — is exactly the claim
// under test. `env` is `"preview"` because this project runs against the preview server only (the production
// server has its own `production/` specs).
test("GET /api/health answers in the 01 §4c envelope with the deploy sha (06 §7.3)", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  const body = (await response.json()) as {
    data?: { sha?: string; env?: string; db?: string };
    error?: unknown;
    requestId?: string;
  };

  expect(response.status()).toBe(STATUS.ok);
  expect(isRequestId(body.requestId)).toBe(true);
  expect(response.headers()["x-request-id"]).toBe(body.requestId);
  expect(body.error).toBeUndefined();
  expect(typeof body.data?.sha).toBe("string");
  expect(body.data?.env).toBe("preview");
  expect(body.data?.db).toBe("failed");
});

// 01 §4c rule: `x-request-id` on every response of the envelope, carrying the same value as the body's
// `requestId`. Pinned on a route that does carry it, so the header contract is asserted somewhere even while
// `/api/health` sits outside it.
test("an enveloped route carries x-request-id and a uuid requestId", async ({
  request,
}) => {
  const response = await request.get("/api/cron/expire-trials");
  const envelope = await errorEnvelopeOf(response);

  expect(response.headers()["x-request-id"]).toBe(envelope.requestId);
});
