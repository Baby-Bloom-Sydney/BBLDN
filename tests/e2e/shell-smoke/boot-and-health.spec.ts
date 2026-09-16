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
// The shipped route returns a bare `{ status: "ok" }` with no envelope, no sha, no env, no db read and no
// `x-request-id` — a deliberate F-c choice ("the least informative route in the app") that no ADR records.
// **The document wins**, so the assertion is written to the document and marked as currently failing rather than
// rewritten to bless the code. Remove the `test.fail()` with the route fix — or with the ADR that exempts
// `/api/health` from 01 §4c, in which case 06 §7.3 and §4.5 are the sections to amend first. Until one of those
// happens, 06 §4.5's promote verify step cannot be performed as written.
//
// The shape is spelled out inline here rather than read through `envelope.ts`: `SuccessEnvelope<T>`'s `T` is
// whatever the route returns, and what 06 §7.3 says that `T` is — `{ sha, env, db }` — is exactly the claim
// under test.
test("GET /api/health answers in the 01 §4c envelope with the deploy sha (06 §7.3)", async ({
  request,
}) => {
  test.fail(
    true,
    "recorded disagreement: 06 §7.3 vs the shipped route — docs/build-progress.md",
  );

  const response = await request.get("/api/health");
  const body = (await response.json()) as {
    data?: { sha?: string; env?: string; db?: string };
    requestId?: string;
  };

  expect(isRequestId(body.requestId)).toBe(true);
  expect(body.data).toEqual(expect.objectContaining({ db: "ok" }));
  expect(typeof body.data?.sha).toBe("string");
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
