// E1 assertion 4 (crons) — **every one of the 23 cron shells fails closed**, asserted on the assembled server
// rather than on the helper.
//
// Why at this level, when `src/app/api/_lib/__tests__/run-cron.test.ts` already covers `runCron`: that suite
// proves the helper, and separately proves that a route *file* exists for every declared path. Neither proves
// that a given route file is wired to the helper. A cron route that forgot to call `runCron` — or called it
// with the wrong path, so `cronSpecFor` returns undefined — would pass both and still be wrong in production.
// Here the assertion is made through Next's own router, once per declared path, which is the only place that
// mistake shows up.
//
// The inherited bug this pins (S2 security-reviewer CRITICAL; 01 §4e): eleven Sydney cron routes wrote
// `if (cronSecret) { …check… }`, so an **unset** `CRON_SECRET` authorised every caller. F-c replaced the set;
// FIX-1 and the boundary work kept it. Three refusals per route — absent, blank, wrong — because all three were
// reachable holes in that shape.
import { expect, test } from "@playwright/test";
import { CRONS } from "@/modules/config";
import { errorEnvelopeOf, STATUS } from "./envelope";
import { requiredSecret } from "./secrets";

const DECLARED_CRON_COUNT = 23;

const refusals = [
  { label: "no authorization header", headers: {} },
  { label: "a blank bearer", headers: { authorization: "Bearer " } },
  {
    label: "a wrong bearer",
    headers: { authorization: "Bearer not-the-cron-secret" },
  },
] as const;

test("config/crons.ts declares the schedules this suite walks", () => {
  expect(CRONS.length).toBe(DECLARED_CRON_COUNT);
});

for (const spec of CRONS) {
  test(`${spec.path} fails closed`, async ({ request }) => {
    for (const refusal of refusals) {
      const response = await request.get(spec.path, {
        headers: refusal.headers,
      });
      const envelope = await errorEnvelopeOf(response);

      expect(response.status(), `${spec.path} with ${refusal.label}`).toBe(
        STATUS.unauthenticated,
      );
      expect(envelope.error.code, `${spec.path} with ${refusal.label}`).toBe(
        "UNAUTHENTICATED",
      );
    }
  });

  // E1 assertion 7 — the **baseline**, not an endorsement. An authorised cron reaches `refuseCron("no-handler")`
  // and answers 500, because a 200 would read to an operator as "the job ran" (01 §4f). Every Phase 1 handler
  // flips exactly one of these; until then a deploy produces a wall of ALERT_CRON_FAILED — expected, and noisy.
  // The `no-handler-registered` reason is server-side only: 01 §4a rule 1 keeps an INTERNAL message generic, so
  // `toClientError` strips `details` before the envelope. The wire evidence is the status and the code.
  test(`${spec.path} answers no-handler-registered to an authorised caller`, async ({
    request,
  }) => {
    const response = await request.get(spec.path, {
      headers: { authorization: `Bearer ${requiredSecret("CRON_SECRET")}` },
    });
    const envelope = await errorEnvelopeOf(response);

    expect(response.status()).toBe(STATUS.internal);
    expect(envelope.error.code).toBe("INTERNAL");
  });
}

// `cronSpecFor` returning undefined is what stops an unscheduled path from running work: Vercel only calls what
// `vercel.json` carries, and `vercel.json` is generated from `CRONS`.
test("an undeclared cron path never runs, even with the right bearer", async ({
  request,
}) => {
  const response = await request.get("/api/cron/not-a-declared-job", {
    headers: { authorization: `Bearer ${requiredSecret("CRON_SECRET")}` },
  });

  expect(response.status()).toBe(STATUS.notFound);
});
